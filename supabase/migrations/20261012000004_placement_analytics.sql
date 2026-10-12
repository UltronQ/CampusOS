-- M3-3: one consistent, complete database snapshot, without REST row-limit truncation.
BEGIN;
CREATE FUNCTION public.get_placement_analytics_snapshot() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_placement_incharge() THEN
    RAISE EXCEPTION 'Placement analytics requires Placement In-Charge access.' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'snapshot_at', statement_timestamp(),
    'departments', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM
      (SELECT id, code FROM public.departments) r), '[]'::jsonb),
    'companies', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM
      (SELECT id, name FROM public.companies) r), '[]'::jsonb),
    'students', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM
      (SELECT id, department_id, graduation_year, cgpa, backlogs, placement_registered, eligibility_status FROM public.students) r), '[]'::jsonb),
    'drives', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM
      (SELECT id, company_id, status, start_date, eligible_graduation_years, min_cgpa, max_backlogs,
        department_ids, graduation_years, minimum_cgpa, maximum_backlogs FROM public.drives) r), '[]'::jsonb),
    'drive_departments', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.drive_id, r.department_id) FROM
      (SELECT drive_id, department_id FROM public.drive_departments) r), '[]'::jsonb),
    'applications', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM
      (SELECT id, student_id, drive_id, status FROM public.applications) r), '[]'::jsonb),
    'offers', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM
      (SELECT id, application_id, status, annual_ctc_minor::text AS annual_ctc_minor, currency FROM public.offers) r), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_placement_analytics_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_placement_analytics_snapshot() TO authenticated;
COMMIT;
