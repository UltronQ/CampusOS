-- M2-3: enforce recruitment invariants even for direct REST writes.
BEGIN;
-- NUMERIC(3,2) cannot represent the documented CGPA upper bound, 10.00.
ALTER TABLE students ALTER COLUMN cgpa TYPE NUMERIC(4,2);
-- Phase-one alignment already supplies this column in the complete migration chain.
-- Keep the standalone recruitment setup compatible without rewriting existing data.
ALTER TABLE students ADD COLUMN IF NOT EXISTS backlogs INTEGER CHECK (backlogs >= 0);
ALTER TABLE drives
  ADD COLUMN department_ids UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN graduation_years INTEGER[] NOT NULL DEFAULT '{}',
  ADD COLUMN minimum_cgpa NUMERIC(4,2) CHECK (minimum_cgpa BETWEEN 0 AND 10),
  ADD COLUMN maximum_backlogs INTEGER CHECK (maximum_backlogs >= 0),
  ADD CONSTRAINT drive_title_nonempty CHECK (length(trim(title)) > 0),
  ADD CONSTRAINT drive_departments_no_null CHECK (array_position(department_ids, NULL) IS NULL),
  ADD CONSTRAINT drive_batches_valid CHECK (array_position(graduation_years, NULL) IS NULL AND 1900 < ALL(graduation_years) AND 2100 > ALL(graduation_years));
ALTER TABLE companies ADD CONSTRAINT company_name_nonempty CHECK (length(trim(name)) > 0);
ALTER TABLE offers ADD CONSTRAINT offer_currency_valid CHECK (currency ~ '^[A-Z]{3}$');

-- Never silently cascade-delete recruitment history. Dependents must be removed
-- explicitly, from leaves to roots, by an in-charge.
ALTER TABLE applications DROP CONSTRAINT applications_drive_id_fkey,
  ADD CONSTRAINT applications_drive_id_fkey FOREIGN KEY (drive_id) REFERENCES drives(id) ON DELETE RESTRICT;
ALTER TABLE applications DROP CONSTRAINT applications_student_id_fkey,
  ADD CONSTRAINT applications_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT;
ALTER TABLE recruitment_stages DROP CONSTRAINT recruitment_stages_drive_id_fkey,
  ADD CONSTRAINT recruitment_stages_drive_id_fkey FOREIGN KEY (drive_id) REFERENCES drives(id) ON DELETE RESTRICT;
ALTER TABLE offers DROP CONSTRAINT offers_application_id_fkey,
  ADD CONSTRAINT offers_application_id_fkey FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE RESTRICT;
ALTER TABLE application_stage_results DROP CONSTRAINT application_stage_results_application_id_fkey,
  ADD CONSTRAINT application_stage_results_application_id_fkey FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE RESTRICT;

CREATE FUNCTION recruitment_eligible(s students, d drives) RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT (cardinality(d.department_ids) = 0 OR s.department_id = ANY(d.department_ids))
    AND (cardinality(d.graduation_years) = 0 OR s.graduation_year = ANY(d.graduation_years))
    AND (d.minimum_cgpa IS NULL OR (s.cgpa IS NOT NULL AND s.cgpa >= d.minimum_cgpa))
    AND (d.maximum_backlogs IS NULL OR (s.backlogs IS NOT NULL AND s.backlogs <= d.maximum_backlogs));
$$;

DROP POLICY IF EXISTS "Authenticated users can read drives" ON drives;
-- Preserve phase-one's eligible-drive policy. Permissive SELECT policies are
-- OR-combined, so adding a broader policy would undo that authorization rule.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
    AND tablename = 'drives' AND policyname = 'Students can read eligible published drives') THEN
    CREATE POLICY "Students read visible drives" ON drives FOR SELECT TO authenticated
      USING (status IN ('published','completed','cancelled'));
  END IF;
END;
$$;
CREATE POLICY "Students respond to own offers" ON offers FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM applications a WHERE a.id = application_id AND a.student_id = get_student_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM applications a WHERE a.id = application_id AND a.student_id = get_student_id()));

-- This invoker RPC uses RLS and explicitly rejects another student's identity.
CREATE FUNCTION get_student_drives(p_student_id UUID) RETURNS SETOF drives
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE s students;
BEGIN
  IF auth.uid() IS NULL OR NOT (is_placement_incharge() OR p_student_id = get_student_id()) THEN
    RAISE EXCEPTION 'Student access denied' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO STRICT s FROM students WHERE id = p_student_id;
  RETURN QUERY SELECT d.* FROM drives d WHERE d.status = 'published'
    AND recruitment_eligible(s,d) ORDER BY d.start_date, d.id;
END;
$$;

CREATE FUNCTION guard_recruitment_drive() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM unnest(NEW.department_ids) AS x(id)
    WHERE NOT EXISTS (SELECT 1 FROM departments d WHERE d.id = x.id)) THEN
    RAISE EXCEPTION 'Unknown eligible department' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.status <> 'draft' THEN
    RAISE EXCEPTION 'Drives start as draft' USING ERRCODE = '23514';
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.id <> OLD.id OR NEW.company_id <> OLD.company_id OR NEW.created_at <> OLD.created_at THEN
      RAISE EXCEPTION 'Drive identity is immutable' USING ERRCODE = '23514';
    END IF;
    IF NEW.status <> OLD.status AND NOT (
      (OLD.status = 'draft' AND NEW.status IN ('published','cancelled')) OR
      (OLD.status = 'published' AND NEW.status IN ('completed','cancelled'))) THEN
      RAISE EXCEPTION 'Invalid drive transition' USING ERRCODE = '23514';
    END IF;
    IF OLD.status <> 'draft' AND (NEW.department_ids,NEW.graduation_years,NEW.minimum_cgpa,NEW.maximum_backlogs)
      IS DISTINCT FROM (OLD.department_ids,OLD.graduation_years,OLD.minimum_cgpa,OLD.maximum_backlogs) THEN
      RAISE EXCEPTION 'Eligibility freezes on publication' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_drive BEFORE INSERT OR UPDATE ON drives FOR EACH ROW EXECUTE FUNCTION guard_recruitment_drive();

CREATE FUNCTION guard_recruitment_application() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d drives; s students;
BEGIN
  IF auth.uid() IS NULL OR NOT (is_placement_incharge() OR NEW.student_id = get_student_id()) THEN
    RAISE EXCEPTION 'Application access denied' USING ERRCODE = '42501';
  END IF;
  -- Parent locks serialize cancellation, application changes and offer issuance.
  SELECT * INTO d FROM drives WHERE id = NEW.drive_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Drive missing or inaccessible' USING ERRCODE = '42501'; END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO s FROM students WHERE id = NEW.student_id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Student missing or inaccessible' USING ERRCODE = '42501'; END IF;
    IF NEW.status <> 'applied' OR d.status <> 'published' OR NOT recruitment_eligible(s,d) THEN
      RAISE EXCEPTION 'Application requires published eligible drive and applied status' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF (NEW.id,NEW.student_id,NEW.drive_id,NEW.applied_at) IS DISTINCT FROM
      (OLD.id,OLD.student_id,OLD.drive_id,OLD.applied_at) THEN
      RAISE EXCEPTION 'Application identity is immutable' USING ERRCODE = '23514';
    END IF;
    IF NOT is_placement_incharge() AND NEW.status NOT IN (OLD.status,'withdrawn') THEN
      RAISE EXCEPTION 'Students may only withdraw' USING ERRCODE = '42501';
    END IF;
    IF NEW.status <> OLD.status AND (d.status = 'cancelled' OR NOT (
      (OLD.status = 'applied' AND NEW.status IN ('in_progress','selected','rejected','withdrawn')) OR
      (OLD.status = 'in_progress' AND NEW.status IN ('selected','rejected','withdrawn')) OR
      (OLD.status = 'selected' AND NEW.status = 'withdrawn'))) THEN
      RAISE EXCEPTION 'Invalid application transition' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_application BEFORE INSERT OR UPDATE ON applications FOR EACH ROW EXECUTE FUNCTION guard_recruitment_application();

CREATE FUNCTION guard_recruitment_offer() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a applications; d drives; parent_drive UUID;
BEGIN
  SELECT drive_id INTO parent_drive FROM applications WHERE id = NEW.application_id;
  SELECT * INTO d FROM drives WHERE id = parent_drive FOR UPDATE;
  SELECT * INTO a FROM applications WHERE id = NEW.application_id FOR UPDATE;
  IF auth.uid() IS NULL OR NOT (is_placement_incharge() OR
    (TG_OP = 'UPDATE' AND a.student_id = get_student_id())) THEN
    RAISE EXCEPTION 'Offer access denied' USING ERRCODE = '42501';
  END IF;
  IF a.id IS NULL OR d.id IS NULL THEN
    RAISE EXCEPTION 'Application missing or inaccessible' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'offered' OR a.status <> 'selected' OR d.status NOT IN ('published','completed') THEN
      RAISE EXCEPTION 'Offer requires selected application and active drive' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF (NEW.id,NEW.application_id,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.application_id,OLD.created_at) THEN
      RAISE EXCEPTION 'Offer identity is immutable' USING ERRCODE = '23514';
    END IF;
    IF NOT is_placement_incharge() AND (
      (NEW.annual_ctc_minor,NEW.currency) IS DISTINCT FROM (OLD.annual_ctc_minor,OLD.currency)
      OR (NEW.status <> OLD.status AND NEW.status NOT IN ('accepted','declined'))) THEN
      RAISE EXCEPTION 'Students may only accept or decline' USING ERRCODE = '42501';
    END IF;
    IF NEW.status <> OLD.status AND NOT (
      (OLD.status = 'offered' AND NEW.status IN ('accepted','declined','revoked')) OR
      (OLD.status = 'accepted' AND NEW.status = 'revoked')) THEN
      RAISE EXCEPTION 'Invalid offer transition' USING ERRCODE = '23514';
    END IF;
    IF NEW.status IN ('accepted','declined') AND NEW.status <> OLD.status
      AND (a.status <> 'selected' OR d.status NOT IN ('published','completed')) THEN
      RAISE EXCEPTION 'Inactive application or drive' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_offer BEFORE INSERT OR UPDATE ON offers FOR EACH ROW EXECUTE FUNCTION guard_recruitment_offer();

CREATE FUNCTION get_recruitment_success_counts(p_drive_id UUID DEFAULT NULL)
RETURNS TABLE (successful_offers BIGINT, placed_students BIGINT)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT count(o.id), count(DISTINCT a.student_id)
  FROM offers o JOIN applications a ON a.id = o.application_id
  JOIN drives d ON d.id = a.drive_id
  WHERE o.status IN ('offered','accepted') AND a.status <> 'withdrawn'
    AND d.status IN ('published','completed') AND (p_drive_id IS NULL OR d.id = p_drive_id);
$$;
REVOKE ALL ON FUNCTION get_student_drives(UUID), get_recruitment_success_counts(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_student_drives(UUID), get_recruitment_success_counts(UUID) TO authenticated;
COMMIT;
