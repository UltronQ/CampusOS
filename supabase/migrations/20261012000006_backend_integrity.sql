BEGIN;

-- A temp table must never shadow a trusted definer's authorization/parent tables.
-- Keep pg_temp explicitly last, and prevent authenticated callers from replacing
-- public functions/relations that these routines depend on.
REVOKE CREATE ON SCHEMA public FROM PUBLIC, authenticated, anon;
ALTER FUNCTION is_placement_incharge(UUID) SET search_path=public,pg_temp;
ALTER FUNCTION get_student_id(UUID) SET search_path=public,pg_temp;
ALTER FUNCTION guard_recruitment_application() SET search_path=public,pg_temp;
ALTER FUNCTION guard_recruitment_offer() SET search_path=public,pg_temp;
ALTER FUNCTION guard_student_clearance() SET search_path=public,pg_temp;

CREATE FUNCTION campus_trim(value TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT regexp_replace(value,'^[[:space:]]+|[[:space:]]+$','','g');
$$;
CREATE UNIQUE INDEX departments_normalized_code_unique ON departments(upper(campus_trim(code)));
ALTER TABLE departments ADD CONSTRAINT department_code_nonempty CHECK (length(campus_trim(code))>0),
  ADD CONSTRAINT department_name_nonempty CHECK (length(campus_trim(name))>0);

-- Helpers may be used by policies, but never expose another user's link/role to students.
CREATE OR REPLACE FUNCTION is_placement_incharge(uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public,pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM profiles p WHERE p.id = uid AND p.role = 'placement_incharge')
    AND (uid = auth.uid() OR EXISTS (SELECT 1 FROM profiles actor WHERE actor.id = auth.uid() AND actor.role = 'placement_incharge'));
$$;
CREATE OR REPLACE FUNCTION get_student_id(uid UUID DEFAULT auth.uid())
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public,pg_temp AS $$
  SELECT s.id FROM students s WHERE s.user_id = uid
    AND (uid = auth.uid() OR EXISTS (SELECT 1 FROM profiles actor WHERE actor.id = auth.uid() AND actor.role = 'placement_incharge')) LIMIT 1;
$$;

CREATE FUNCTION normalize_student_record() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.student_number := campus_trim(NEW.student_number);
  NEW.full_name := campus_trim(NEW.full_name);
  NEW.email := lower(campus_trim(NEW.email::TEXT));
  NEW.phone := nullif(campus_trim(NEW.phone),'');
  IF NEW.student_number IS NULL OR length(NEW.student_number) NOT BETWEEN 1 AND 128
    OR NEW.full_name IS NULL OR length(NEW.full_name) NOT BETWEEN 1 AND 200
    OR NEW.email IS NULL OR length(NEW.email::TEXT) > 320
    OR NEW.email::TEXT !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Invalid student identity or email' USING ERRCODE = '23514';
  END IF;
  IF NEW.phone IS NOT NULL AND (NEW.phone !~ '^\+?[0-9 ()-]+$'
    OR length(regexp_replace(NEW.phone,'[^0-9]','','g')) NOT BETWEEN 7 AND 15) THEN
    RAISE EXCEPTION 'Invalid student phone' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER normalize_student_record BEFORE INSERT OR UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION normalize_student_record();
-- Protect existing rows too; do not silently repair colliding identities.
UPDATE students SET student_number=student_number;
ALTER TABLE students
  ADD CONSTRAINT student_number_normalized CHECK (student_number=campus_trim(student_number) AND length(student_number) BETWEEN 1 AND 128),
  ADD CONSTRAINT student_full_name_valid CHECK (full_name=campus_trim(full_name) AND length(full_name) BETWEEN 1 AND 200),
  ADD CONSTRAINT student_email_valid CHECK (email::TEXT=lower(campus_trim(email::TEXT)) AND length(email::TEXT)<=320
    AND email::TEXT ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  ADD CONSTRAINT student_phone_valid CHECK (phone IS NULL OR (phone ~ '^\+?[0-9 ()-]+$'
    AND length(regexp_replace(phone,'[^0-9]','','g')) BETWEEN 7 AND 15));

DROP POLICY "Authenticated users can read stages" ON recruitment_stages;
CREATE POLICY "Students read stages in visible drives" ON recruitment_stages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM drives d WHERE d.id=drive_id AND d.status IN ('published','completed','cancelled')));
ALTER TABLE recruitment_stages ADD CONSTRAINT stage_name_nonempty CHECK (length(trim(name))>0);
ALTER TABLE application_stage_results DROP CONSTRAINT application_stage_results_stage_id_fkey,
  ADD CONSTRAINT application_stage_results_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES recruitment_stages(id) ON DELETE RESTRICT;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM application_stage_results r JOIN applications a ON a.id=r.application_id
    JOIN recruitment_stages s ON s.id=r.stage_id WHERE a.drive_id<>s.drive_id) THEN
    RAISE EXCEPTION 'Resolve existing stage results linked to a different drive before migrating' USING ERRCODE='23514';
  END IF;
END $$;

CREATE FUNCTION guard_stage_integrity() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,pg_temp AS $$
DECLARE application_drive UUID; stage_drive UUID;
BEGIN
  IF auth.uid() IS NULL OR NOT is_placement_incharge() THEN
    RAISE EXCEPTION 'Only placement in-charge manages stages' USING ERRCODE = '42501';
  END IF;
  IF TG_TABLE_NAME = 'recruitment_stages' THEN
    IF TG_OP='UPDATE' AND (NEW.id,NEW.drive_id,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.drive_id,OLD.created_at) THEN
      RAISE EXCEPTION 'Stage identity is immutable' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF TG_OP='UPDATE' AND (NEW.id,NEW.application_id,NEW.stage_id,NEW.created_at)
      IS DISTINCT FROM (OLD.id,OLD.application_id,OLD.stage_id,OLD.created_at) THEN
      RAISE EXCEPTION 'Stage result identity is immutable' USING ERRCODE = '23514';
    END IF;
    SELECT drive_id INTO application_drive FROM applications WHERE id=NEW.application_id FOR SHARE;
    SELECT drive_id INTO stage_drive FROM recruitment_stages WHERE id=NEW.stage_id FOR SHARE;
    IF application_drive IS NULL OR stage_drive IS NULL OR application_drive<>stage_drive THEN
      RAISE EXCEPTION 'Stage result must match application drive' USING ERRCODE = '23514';
    END IF;
    IF NEW.published_at IS NOT NULL THEN
      IF TG_OP='INSERT' OR NEW.published_at IS DISTINCT FROM OLD.published_at THEN
        NEW.published_at := clock_timestamp();
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_stage BEFORE INSERT OR UPDATE ON recruitment_stages FOR EACH ROW EXECUTE FUNCTION guard_stage_integrity();
CREATE TRIGGER guard_stage_result BEFORE INSERT OR UPDATE ON application_stage_results FOR EACH ROW EXECUTE FUNCTION guard_stage_integrity();

-- M2-2 already supplies the confirmed atomic/partial import RPC and audit counts.
-- A JSONB-only overload would conflict with its default parameters in PostgREST
-- and bypass the explicit confirmation boundary. Retain the canonical signature.
DROP FUNCTION IF EXISTS public.commit_student_import(JSONB);
COMMIT;
