BEGIN;
CREATE FUNCTION get_report_records(p_kind TEXT, p_filters JSONB DEFAULT '{}',
  p_student_ids UUID[] DEFAULT '{}', p_limit INTEGER DEFAULT 10000)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE department_ids UUID[]; graduation_years INTEGER[]; company_ids UUID[]; drive_ids UUID[];
  drive_statuses TEXT[]; date_from DATE; date_to DATE; key TEXT; filters JSONB;
  records JSONB; allowed TEXT[]; canonical_students UUID[];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('placement_summary','placement_offers','no_dues_statement')
    OR p_filters IS NULL OR jsonb_typeof(p_filters)<>'object'
    OR p_student_ids IS NULL OR array_position(p_student_ids,NULL) IS NOT NULL
    OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION 'Invalid report input' USING ERRCODE='22023';
  END IF;
  allowed := ARRAY['department_ids','graduation_years'];
  IF p_kind<>'no_dues_statement' THEN
    allowed := allowed || ARRAY['company_ids','drive_ids','drive_statuses','drive_start_from','drive_start_to'];
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_filters) k WHERE NOT k=ANY(allowed)) THEN
    RAISE EXCEPTION 'Unsupported report filters' USING ERRCODE='22023';
  END IF;
  BEGIN
    FOREACH key IN ARRAY ARRAY['department_ids','company_ids','drive_ids','graduation_years','drive_statuses'] LOOP
      IF p_filters ? key THEN
        IF jsonb_typeof(p_filters->key)<>'array' THEN RAISE EXCEPTION 'Expected filter array' USING ERRCODE='22023'; END IF;
        IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_filters->key) v
          WHERE jsonb_typeof(v)<>CASE WHEN key='graduation_years' THEN 'number' ELSE 'string' END) THEN
          RAISE EXCEPTION 'Invalid filter element types' USING ERRCODE='22023';
        END IF;
      END IF;
    END LOOP;
    department_ids := ARRAY(SELECT DISTINCT value::UUID FROM jsonb_array_elements_text(coalesce(p_filters->'department_ids','[]')) ORDER BY 1);
    company_ids := ARRAY(SELECT DISTINCT value::UUID FROM jsonb_array_elements_text(coalesce(p_filters->'company_ids','[]')) ORDER BY 1);
    drive_ids := ARRAY(SELECT DISTINCT value::UUID FROM jsonb_array_elements_text(coalesce(p_filters->'drive_ids','[]')) ORDER BY 1);
    IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(p_filters->'graduation_years','[]')) v
      WHERE v::NUMERIC<>trunc(v::NUMERIC) OR v::NUMERIC NOT BETWEEN 1901 AND 2099) THEN
      RAISE EXCEPTION 'Invalid graduation batch' USING ERRCODE='22023';
    END IF;
    graduation_years := ARRAY(SELECT DISTINCT value::INTEGER FROM jsonb_array_elements_text(coalesce(p_filters->'graduation_years','[]')) ORDER BY 1);
    drive_statuses := ARRAY(SELECT DISTINCT value FROM jsonb_array_elements_text(coalesce(p_filters->'drive_statuses','[]')) ORDER BY 1);
    IF NOT drive_statuses<@ARRAY['published','completed']::TEXT[] THEN
      RAISE EXCEPTION 'Invalid drive statuses' USING ERRCODE='22023';
    END IF;
    FOREACH key IN ARRAY ARRAY['drive_start_from','drive_start_to'] LOOP
      IF p_filters ? key AND p_filters->key<>'null'::JSONB THEN
        IF jsonb_typeof(p_filters->key)<>'string' OR p_filters->>key !~ '^\d{4}-\d{2}-\d{2}$' THEN
          RAISE EXCEPTION 'Invalid report date' USING ERRCODE='22023';
        END IF;
      END IF;
    END LOOP;
    date_from := (p_filters->>'drive_start_from')::DATE;
    date_to := (p_filters->>'drive_start_to')::DATE;
    IF date_from>date_to THEN RAISE EXCEPTION 'Inverted date range' USING ERRCODE='22023'; END IF;
  EXCEPTION WHEN data_exception THEN
    RAISE EXCEPTION 'Invalid report filter values' USING ERRCODE='22023';
  END;
  canonical_students := ARRAY(SELECT DISTINCT id FROM unnest(p_student_ids) id ORDER BY id);
  filters := jsonb_build_object('department_ids',department_ids,'graduation_years',graduation_years);
  IF p_kind='no_dues_statement' THEN
    SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.department_code,r.student_number,r.student_id),'[]') INTO records
    FROM (SELECT * FROM get_no_dues_student_summary(department_ids,graduation_years)
      WHERE cardinality(canonical_students)=0 OR student_id=ANY(canonical_students)
      ORDER BY department_code,student_number,student_id LIMIT p_limit+1) r;
  ELSE
    filters := filters || jsonb_build_object('company_ids',company_ids,'drive_ids',drive_ids,
      'drive_statuses',drive_statuses,'drive_start_from',date_from,'drive_start_to',date_to);
    WITH cohort AS MATERIALIZED (
      SELECT s.*,d.code AS department_code FROM students s JOIN departments d ON d.id=s.department_id
      WHERE (cardinality(department_ids)=0 OR s.department_id=ANY(department_ids))
        AND (cardinality(graduation_years)=0 OR s.graduation_year=ANY(graduation_years))
        AND (cardinality(canonical_students)=0 OR s.id=ANY(canonical_students))
    ), successful AS MATERIALIZED (
      SELECT s.id AS student_id,s.student_number,s.full_name,s.department_code,s.graduation_year,
        c.name AS company_name,d.title AS drive_title,a.status AS application_status,
        o.id AS offer_id,o.status AS offer_status,o.annual_ctc_minor,o.currency
      FROM cohort s JOIN applications a ON a.student_id=s.id JOIN drives d ON d.id=a.drive_id
      JOIN companies c ON c.id=d.company_id JOIN offers o ON o.application_id=a.id
      WHERE a.status<>'withdrawn' AND d.status IN ('published','completed') AND o.status IN ('offered','accepted')
        AND (cardinality(company_ids)=0 OR d.company_id=ANY(company_ids))
        AND (cardinality(drive_ids)=0 OR d.id=ANY(drive_ids))
        AND (cardinality(drive_statuses)=0 OR d.status::TEXT=ANY(drive_statuses))
        AND (date_from IS NULL OR d.start_date>=date_from) AND (date_to IS NULL OR d.start_date<=date_to)
    ), result AS (
      SELECT to_jsonb(o) AS record,o.department_code,o.student_number,o.student_id,o.offer_id
        FROM successful o WHERE p_kind='placement_offers'
      UNION ALL
      SELECT jsonb_build_object('student_id',s.id,'student_number',s.student_number,'full_name',s.full_name,
        'email',s.email,'department_code',s.department_code,'graduation_year',s.graduation_year,
        'placed',count(o.offer_id)>0,'successful_offer_count',count(o.offer_id)),
        s.department_code,s.student_number,s.id,NULL::UUID
        FROM cohort s LEFT JOIN successful o ON o.student_id=s.id WHERE p_kind='placement_summary'
        GROUP BY s.id,s.student_number,s.full_name,s.email,s.department_code,s.graduation_year
    ) SELECT coalesce(jsonb_agg(r.record ORDER BY r.department_code,r.student_number,r.student_id,r.offer_id),'[]') INTO records
      FROM (SELECT * FROM result ORDER BY department_code,student_number,student_id,offer_id LIMIT p_limit+1) r;
  END IF;
  IF jsonb_array_length(records)>p_limit THEN
    RAISE EXCEPTION 'Report exceeds configured row limit' USING ERRCODE='54000';
  END IF;
  RETURN jsonb_build_object('contract_version','1.1.0','snapshot_at',statement_timestamp(),
    'kind',p_kind,'filters',filters,'student_ids',canonical_students,'row_count',jsonb_array_length(records),'rows',records);
END;
$$;
REVOKE ALL ON FUNCTION get_report_records(TEXT,JSONB,UUID[],INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_report_records(TEXT,JSONB,UUID[],INTEGER) TO authenticated;
COMMIT;
