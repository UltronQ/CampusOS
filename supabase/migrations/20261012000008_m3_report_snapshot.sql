-- M3-4 reporting reads: trusted authorization before assembling one consistent snapshot.
BEGIN;
CREATE FUNCTION public.get_campusos_report_snapshot(p_kind TEXT) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE caller UUID := auth.uid(); caller_role TEXT; own_student UUID;
BEGIN
  SELECT role::text INTO caller_role FROM public.profiles WHERE id = caller;
  IF caller IS NULL OR caller_role IS NULL OR caller_role NOT IN ('placement_incharge','student') THEN
    RAISE EXCEPTION 'Authenticated supported profile required.' USING ERRCODE = '42501';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('department_placement','company_outcomes','student_placement_history',
    'unplaced_students','pending_no_dues','no_dues_statement','batch_placement_summary','placement_summary','placement_offers') THEN
    RAISE EXCEPTION 'Unsupported report kind.' USING ERRCODE = '22023';
  END IF;
  IF caller_role = 'student' AND p_kind NOT IN ('student_placement_history','placement_summary','placement_offers','no_dues_statement') THEN
    RAISE EXCEPTION 'Only placement in-charge can access consolidated reports.' USING ERRCODE = '42501';
  END IF;
  SELECT id INTO own_student FROM public.students WHERE user_id = caller;
  RETURN (WITH student_scope AS MATERIALIZED (
      SELECT id,student_number,full_name,email::text,department_id,graduation_year,cgpa,backlogs,
        placement_registered,eligibility_status FROM public.students
      WHERE caller_role = 'placement_incharge' OR id = own_student
    ), app_scope AS MATERIALIZED (
      SELECT a.id,a.student_id,a.drive_id,a.status FROM public.applications a JOIN student_scope s ON s.id=a.student_id
    ), drive_scope AS MATERIALIZED (
      SELECT d.id,d.company_id,d.title,d.status,d.start_date,d.eligible_graduation_years,d.min_cgpa,d.max_backlogs,
        d.department_ids,d.graduation_years,d.minimum_cgpa,d.maximum_backlogs FROM public.drives d
      WHERE caller_role='placement_incharge' OR EXISTS (SELECT 1 FROM app_scope a WHERE a.drive_id=d.id)
    ) SELECT jsonb_build_object(
      'snapshot_at',statement_timestamp(),'report_kind',p_kind,
      'departments',COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM
        (SELECT d.id,d.code FROM public.departments d WHERE caller_role='placement_incharge'
          OR EXISTS (SELECT 1 FROM student_scope s WHERE s.department_id=d.id)) r),'[]'::jsonb),
      'companies',COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM
        (SELECT c.id,c.name FROM public.companies c WHERE caller_role='placement_incharge'
          OR EXISTS (SELECT 1 FROM drive_scope d WHERE d.company_id=c.id)) r),'[]'::jsonb),
      'students',COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM student_scope s),'[]'::jsonb),
      'drives',COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id) FROM drive_scope d),'[]'::jsonb),
      'drive_departments',COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.drive_id,r.department_id) FROM
        (SELECT dd.drive_id,dd.department_id FROM public.drive_departments dd JOIN drive_scope d ON d.id=dd.drive_id) r),'[]'::jsonb),
      'applications',COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM app_scope a),'[]'::jsonb),
      'offers',COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM
        (SELECT o.id,o.application_id,o.status,o.annual_ctc_minor::text AS annual_ctc_minor,o.currency
          FROM public.offers o JOIN app_scope a ON a.id=o.application_id) r),'[]'::jsonb),
      'published_stages',COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.application_id,r.sequence,r.id) FROM
        (SELECT ar.id,ar.application_id,ar.status,ar.published_at,rs.name,rs.sequence
          FROM public.application_stage_results ar JOIN app_scope a ON a.id=ar.application_id
          JOIN public.recruitment_stages rs ON rs.id=ar.stage_id WHERE ar.published_at IS NOT NULL) r),'[]'::jsonb),
      'no_dues_statements',COALESCE((SELECT jsonb_agg(public.get_student_no_dues_statement(s.id) ORDER BY s.id)
        FROM student_scope s WHERE p_kind IN ('pending_no_dues','no_dues_statement')),'[]'::jsonb)
    ));
END;
$$;
REVOKE ALL ON FUNCTION public.get_campusos_report_snapshot(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_campusos_report_snapshot(TEXT) TO authenticated;
COMMIT;
