BEGIN;

ALTER TABLE clearance_items
  ADD CONSTRAINT clearance_item_name_nonempty CHECK (length(trim(name)) > 0);
ALTER TABLE student_clearances
  ADD COLUMN remarks TEXT,
  ADD COLUMN pending_requirements TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  DROP CONSTRAINT student_clearances_approval_consistency,
  ADD CONSTRAINT student_clearances_approval_consistency CHECK (
    (status IN ('cleared','not_applicable') AND approved_by IS NOT NULL AND approved_at IS NOT NULL)
    OR (status IN ('pending','rejected') AND approved_by IS NULL AND approved_at IS NULL)),
  ADD CONSTRAINT clearance_requirements_valid CHECK (
    array_position(pending_requirements, NULL) IS NULL
    AND (cardinality(pending_requirements) = 0 OR status IN ('pending','rejected'))),
  ADD CONSTRAINT clearance_rejection_explained CHECK (
    status <> 'rejected' OR length(trim(coalesce(remarks,''))) > 0 OR cardinality(pending_requirements) > 0);

-- Preserve decisions when configuration or student records are deleted.
ALTER TABLE clearance_items DROP CONSTRAINT clearance_items_department_id_fkey,
  ADD CONSTRAINT clearance_items_department_id_fkey FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT;
ALTER TABLE student_clearances DROP CONSTRAINT student_clearances_clearance_item_id_fkey,
  ADD CONSTRAINT student_clearances_clearance_item_id_fkey FOREIGN KEY (clearance_item_id) REFERENCES clearance_items(id) ON DELETE RESTRICT;
ALTER TABLE student_clearances DROP CONSTRAINT student_clearances_student_id_fkey,
  ADD CONSTRAINT student_clearances_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT;

CREATE FUNCTION guard_clearance_item() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT is_placement_incharge() THEN
    RAISE EXCEPTION 'Only placement in-charge configures clearance' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.id,NEW.department_id,NEW.created_at)
    IS DISTINCT FROM (OLD.id,OLD.department_id,OLD.created_at) THEN
    RAISE EXCEPTION 'Clearance category identity is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_clearance_item BEFORE INSERT OR UPDATE ON clearance_items
  FOR EACH ROW EXECUTE FUNCTION guard_clearance_item();

CREATE FUNCTION guard_student_clearance() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE student_department UUID; item_department UUID; requirement TEXT;
BEGIN
  IF auth.uid() IS NULL OR NOT is_placement_incharge() THEN
    RAISE EXCEPTION 'Only placement in-charge changes clearance decisions' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.id,NEW.student_id,NEW.clearance_item_id,NEW.created_at)
    IS DISTINCT FROM (OLD.id,OLD.student_id,OLD.clearance_item_id,OLD.created_at) THEN
    RAISE EXCEPTION 'Clearance decision identity is immutable' USING ERRCODE = '23514';
  END IF;
  SELECT department_id INTO student_department FROM students WHERE id = NEW.student_id FOR SHARE;
  SELECT department_id INTO item_department FROM clearance_items WHERE id = NEW.clearance_item_id FOR SHARE;
  IF student_department IS NULL OR item_department IS NULL OR student_department <> item_department THEN
    RAISE EXCEPTION 'Clearance item must belong to student department' USING ERRCODE = '23514';
  END IF;
  FOREACH requirement IN ARRAY NEW.pending_requirements LOOP
    IF requirement IS NULL OR length(trim(requirement)) = 0 THEN
      RAISE EXCEPTION 'Pending requirements must contain nonempty text' USING ERRCODE = '23514';
    END IF;
  END LOOP;
  -- Reject fake evidence rather than silently accepting an impersonated approver.
  IF NEW.approved_by IS NOT NULL AND NEW.approved_by <> auth.uid()
    AND (TG_OP = 'INSERT' OR NEW.approved_by IS DISTINCT FROM OLD.approved_by) THEN
    RAISE EXCEPTION 'Approver must be authenticated in-charge' USING ERRCODE = '42501';
  END IF;
  NEW.updated_by := auth.uid();
  NEW.updated_at := clock_timestamp();
  IF TG_OP = 'INSERT' THEN NEW.created_at := NEW.updated_at; END IF;
  IF NEW.status IN ('cleared','not_applicable') THEN
    IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
      NEW.approved_by := auth.uid();
      NEW.approved_at := NEW.updated_at;
    ELSE
      NEW.approved_by := OLD.approved_by;
      NEW.approved_at := OLD.approved_at;
    END IF;
  ELSE
    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER set_student_clearances_updated_at ON student_clearances;
CREATE TRIGGER guard_student_clearance BEFORE INSERT OR UPDATE ON student_clearances
  FOR EACH ROW EXECUTE FUNCTION guard_student_clearance();

CREATE FUNCTION initialize_student_clearances(p_student_id UUID) RETURNS SETOF student_clearances
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE student_department UUID;
BEGIN
  IF auth.uid() IS NULL OR NOT is_placement_incharge() THEN
    RAISE EXCEPTION 'Only placement in-charge initializes checklists' USING ERRCODE = '42501';
  END IF;
  IF p_student_id IS NULL THEN RAISE EXCEPTION 'Student identity required' USING ERRCODE = '22023'; END IF;
  SELECT department_id INTO STRICT student_department FROM students WHERE id = p_student_id FOR SHARE;
  INSERT INTO student_clearances(student_id,clearance_item_id)
    SELECT p_student_id,i.id FROM clearance_items i
    WHERE i.department_id = student_department AND i.is_active
    ON CONFLICT (student_id,clearance_item_id) DO NOTHING;
  RETURN QUERY SELECT sc.* FROM student_clearances sc JOIN clearance_items i ON i.id = sc.clearance_item_id
    WHERE sc.student_id = p_student_id AND i.department_id = student_department AND i.is_active
    ORDER BY i.name,i.id;
END;
$$;

-- Single reusable business rule. Missing rows contribute to total, never resolved.
CREATE FUNCTION calculate_no_dues_overall(p_mandatory_total BIGINT, p_resolved_total BIGINT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN
  IF p_mandatory_total IS NULL OR p_resolved_total IS NULL OR p_mandatory_total < 0
    OR p_resolved_total < 0 OR p_resolved_total > p_mandatory_total THEN
    RAISE EXCEPTION 'Invalid mandatory counts' USING ERRCODE = '23514';
  END IF;
  RETURN CASE WHEN p_mandatory_total = 0 THEN 'not_configured'
    WHEN p_mandatory_total = p_resolved_total THEN 'cleared' ELSE 'incomplete' END;
END;
$$;

CREATE FUNCTION get_no_dues_student_summary(
  p_department_ids UUID[] DEFAULT '{}', p_graduation_years INTEGER[] DEFAULT '{}',
  p_student_id UUID DEFAULT NULL)
RETURNS TABLE (student_id UUID, student_number TEXT, full_name TEXT, department_id UUID,
  department_code TEXT, graduation_year INTEGER, overall_status TEXT,
  mandatory_total BIGINT, mandatory_cleared BIGINT, mandatory_not_applicable BIGINT,
  mandatory_pending BIGINT, mandatory_rejected BIGINT, mandatory_missing BIGINT)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH counts AS (
    SELECT s.id,s.student_number,s.full_name,s.department_id,d.code,s.graduation_year,
      count(i.id) AS total,
      count(i.id) FILTER (WHERE sc.status = 'cleared') AS cleared,
      count(i.id) FILTER (WHERE sc.status = 'not_applicable') AS not_applicable,
      count(i.id) FILTER (WHERE sc.status = 'pending') AS pending,
      count(i.id) FILTER (WHERE sc.status = 'rejected') AS rejected,
      count(i.id) FILTER (WHERE sc.id IS NULL) AS missing
    FROM students s JOIN departments d ON d.id = s.department_id
    LEFT JOIN clearance_items i ON i.department_id = s.department_id AND i.is_active AND i.is_mandatory
    LEFT JOIN student_clearances sc ON sc.student_id = s.id AND sc.clearance_item_id = i.id
    WHERE (p_student_id IS NULL OR s.id = p_student_id)
      AND (cardinality(p_department_ids) = 0 OR s.department_id = ANY(p_department_ids))
      AND (cardinality(p_graduation_years) = 0 OR s.graduation_year = ANY(p_graduation_years))
    GROUP BY s.id,d.code
  ) SELECT id,student_number,full_name,department_id,code,graduation_year,
    calculate_no_dues_overall(total,cleared + not_applicable),
    total,cleared,not_applicable,pending,rejected,missing FROM counts
    ORDER BY student_number,id;
$$;

CREATE FUNCTION get_student_no_dues_statement(p_student_id UUID) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE summary JSONB; items JSONB;
BEGIN
  IF p_student_id IS NULL THEN RAISE EXCEPTION 'Student identity required' USING ERRCODE = '22023'; END IF;
  IF auth.uid() IS NULL OR NOT (is_placement_incharge() OR p_student_id = get_student_id()) THEN
    RAISE EXCEPTION 'Student statement access denied' USING ERRCODE = '42501';
  END IF;
  SELECT to_jsonb(s) INTO STRICT summary FROM get_no_dues_student_summary(p_student_id => p_student_id) s;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'clearance_item_id',i.id,'name',i.name,'is_mandatory',i.is_mandatory,
    'student_clearance_id',sc.id,'status',coalesce(sc.status,'pending'::clearance_status),
    'is_missing',sc.id IS NULL,'remarks',sc.remarks,
    'pending_requirements',coalesce(sc.pending_requirements,'{}'::TEXT[]),
    'approved_by',sc.approved_by,'approved_at',sc.approved_at,
    'updated_by',sc.updated_by,'updated_at',sc.updated_at,
    'category_updated_at',i.updated_at) ORDER BY i.name,i.id),'[]'::JSONB) INTO items
  FROM clearance_items i JOIN students s ON s.department_id = i.department_id AND s.id = p_student_id
  LEFT JOIN student_clearances sc ON sc.student_id = s.id AND sc.clearance_item_id = i.id
  WHERE i.is_active;
  RETURN summary || jsonb_build_object('items',items,'snapshot_at',statement_timestamp());
END;
$$;

CREATE FUNCTION get_no_dues_progress(p_department_ids UUID[] DEFAULT '{}', p_graduation_years INTEGER[] DEFAULT '{}')
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE result JSONB;
BEGIN
  IF auth.uid() IS NULL OR NOT is_placement_incharge() THEN
    RAISE EXCEPTION 'Only placement in-charge reads consolidated progress' USING ERRCODE = '42501';
  END IF;
  WITH cohort AS MATERIALIZED (SELECT * FROM get_no_dues_student_summary(p_department_ids,p_graduation_years)),
  groups AS (
    SELECT department_id,department_code,graduation_year,
      grouping(department_id) AS all_departments,grouping(graduation_year) AS all_batches,
      count(*) AS total_students,
      count(*) FILTER (WHERE overall_status = 'cleared') AS cleared_students,
      count(*) FILTER (WHERE overall_status = 'incomplete') AS incomplete_students,
      count(*) FILTER (WHERE overall_status = 'not_configured') AS not_configured_students,
      coalesce(sum(mandatory_total),0) AS mandatory_total,
      coalesce(sum(mandatory_cleared),0) AS mandatory_cleared,
      coalesce(sum(mandatory_not_applicable),0) AS mandatory_not_applicable,
      coalesce(sum(mandatory_pending),0) AS mandatory_pending,
      coalesce(sum(mandatory_rejected),0) AS mandatory_rejected,
      coalesce(sum(mandatory_missing),0) AS mandatory_missing,
      round(100.0 * count(*) FILTER (WHERE overall_status = 'cleared') / nullif(count(*),0),2) AS percent
    FROM cohort GROUP BY GROUPING SETS ((),(department_id,department_code),(graduation_year),(department_id,department_code,graduation_year))
  ), formatted AS (SELECT all_departments,all_batches,department_code,department_id,graduation_year,
    to_jsonb(g) - 'all_departments' - 'all_batches' - 'percent' ||
    jsonb_build_object('clearance_rate',jsonb_build_object('numerator',cleared_students,'denominator',total_students,'percent',percent)) AS data
    FROM groups g)
  SELECT jsonb_build_object('snapshot_at',statement_timestamp(),
    'totals',(SELECT data - 'department_id' - 'department_code' - 'graduation_year' FROM formatted WHERE all_departments=1 AND all_batches=1),
    'by_department',coalesce((SELECT jsonb_agg(data - 'graduation_year' ORDER BY department_code,department_id) FROM formatted WHERE all_departments=0 AND all_batches=1),'[]'::JSONB),
    'by_batch',coalesce((SELECT jsonb_agg(data - 'department_id' - 'department_code' ORDER BY graduation_year) FROM formatted WHERE all_departments=1 AND all_batches=0),'[]'::JSONB),
    'by_department_batch',coalesce((SELECT jsonb_agg(data ORDER BY department_code,department_id,graduation_year) FROM formatted WHERE all_departments=0 AND all_batches=0),'[]'::JSONB)
  ) INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION initialize_student_clearances(UUID), calculate_no_dues_overall(BIGINT,BIGINT),
  get_no_dues_student_summary(UUID[],INTEGER[],UUID), get_student_no_dues_statement(UUID),
  get_no_dues_progress(UUID[],INTEGER[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION initialize_student_clearances(UUID), calculate_no_dues_overall(BIGINT,BIGINT),
  get_no_dues_student_summary(UUID[],INTEGER[],UUID), get_student_no_dues_statement(UUID),
  get_no_dues_progress(UUID[],INTEGER[]) TO authenticated;
COMMIT;
