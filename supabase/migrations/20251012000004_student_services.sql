BEGIN;

CREATE FUNCTION public.trim_record_text(input_text TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT btrim(input_text, E' \t\r\n\f' || chr(11) || chr(160) || chr(65279));
$$;

ALTER TABLE public.students
  ADD COLUMN program TEXT,
  ADD COLUMN academic_year INTEGER CHECK (academic_year BETWEEN 1 AND 8),
  ADD COLUMN section TEXT,
  ADD COLUMN placement_registered BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN eligibility_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (eligibility_status IN ('pending', 'eligible', 'ineligible'));

-- These fields are optional for the original Member 3 import schema. Missing
-- academic information remains unknown, rather than inventing a course/year.
CREATE FUNCTION public.validate_student_record()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.student_number := public.trim_record_text(NEW.student_number);
  NEW.full_name := public.trim_record_text(NEW.full_name);
  NEW.email := lower(public.trim_record_text(NEW.email::text));
  NEW.phone := nullif(public.trim_record_text(NEW.phone), '');
  NEW.program := nullif(public.trim_record_text(NEW.program), '');
  NEW.section := nullif(public.trim_record_text(NEW.section), '');
  IF NEW.student_number IS NULL OR length(NEW.student_number) NOT BETWEEN 1 AND 64 THEN
    RAISE EXCEPTION 'Roll number is required and must contain at most 64 characters.' USING ERRCODE = '23514', DETAIL = 'student_number';
  END IF;
  IF NEW.full_name IS NULL OR length(NEW.full_name) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Name is required and must contain at most 200 characters.' USING ERRCODE = '23514', DETAIL = 'full_name';
  END IF;
  IF NEW.email IS NULL OR length(NEW.email::text) > 254 OR NEW.email::text !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@.]{2,}$' THEN
    RAISE EXCEPTION 'A valid student email is required.' USING ERRCODE = '23514', DETAIL = 'email';
  END IF;
  IF NEW.phone IS NOT NULL AND (NEW.phone !~ '^\+?[0-9 ()-]+$'
    OR length(regexp_replace(NEW.phone, '[^0-9]', '', 'g')) NOT BETWEEN 7 AND 15) THEN
    RAISE EXCEPTION 'Phone must contain 7 to 15 digits and permitted punctuation.' USING ERRCODE = '23514', DETAIL = 'phone';
  END IF;
  IF length(NEW.program) > 100 OR length(NEW.section) > 30 THEN
    RAISE EXCEPTION 'Program or section is too long.' USING ERRCODE = '23514', DETAIL = 'program';
  END IF;
  IF NEW.user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = NEW.user_id AND role = 'student'
  ) THEN
    RAISE EXCEPTION 'Link an existing student-role account only.' USING ERRCODE = '23514', DETAIL = 'user_id';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_student_record BEFORE INSERT OR UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.validate_student_record();

CREATE FUNCTION public.validate_department_record()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.code := upper(public.trim_record_text(NEW.code));
  NEW.name := public.trim_record_text(NEW.name);
  IF NEW.code IS NULL OR NEW.code !~ '^[A-Z0-9_-]{1,20}$' THEN
    RAISE EXCEPTION 'Department code must contain 1 to 20 letters, digits, underscores or hyphens.' USING ERRCODE = '23514';
  END IF;
  IF NEW.name IS NULL OR length(NEW.name) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Department name is required and must contain at most 200 characters.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_department_record BEFORE INSERT OR UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.validate_department_record();

-- Helpers cannot be used as an RPC to inspect another user's role/student ID.
CREATE OR REPLACE FUNCTION public.is_placement_incharge(uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT uid = auth.uid() AND EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = uid AND p.role = 'placement_incharge'
  );
$$;
CREATE OR REPLACE FUNCTION public.get_student_id(uid UUID DEFAULT auth.uid())
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT s.id FROM public.students s WHERE s.user_id = uid AND uid = auth.uid() LIMIT 1;
$$;

CREATE TABLE public.student_import_settings (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  min_graduation_year INTEGER NOT NULL DEFAULT 2026,
  max_graduation_year INTEGER NOT NULL DEFAULT 2030,
  max_rows INTEGER NOT NULL DEFAULT 1000 CHECK (max_rows BETWEEN 1 AND 10000),
  CHECK (min_graduation_year > 1900 AND max_graduation_year < 2100 AND min_graduation_year <= max_graduation_year)
);
INSERT INTO public.student_import_settings(id) VALUES (TRUE);
ALTER TABLE public.student_import_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "In-charge can read import settings" ON public.student_import_settings
  FOR SELECT TO authenticated USING (public.is_placement_incharge());
CREATE POLICY "In-charge can update import settings" ON public.student_import_settings
  FOR UPDATE TO authenticated USING (public.is_placement_incharge()) WITH CHECK (public.is_placement_incharge());

CREATE TABLE public.student_import_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  mode TEXT NOT NULL CHECK (mode IN ('atomic', 'partial')),
  total_count INTEGER NOT NULL,
  successful_count INTEGER NOT NULL,
  skipped_count INTEGER NOT NULL,
  failed_count INTEGER NOT NULL,
  duplicate_count INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (total_count = successful_count + skipped_count + failed_count)
);
ALTER TABLE public.student_import_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "In-charge can read import history" ON public.student_import_history
  FOR SELECT TO authenticated USING (public.is_placement_incharge());
-- No client INSERT/UPDATE/DELETE policy: history is written only by the RPC.

CREATE INDEX idx_students_graduation_year ON public.students(graduation_year);
CREATE INDEX idx_students_registration_eligibility ON public.students(placement_registered, eligibility_status);
CREATE INDEX idx_student_import_history_actor ON public.student_import_history(actor_id, created_at);

-- RLS applies to both student rows and count; parameters never contain a role.
CREATE FUNCTION public.search_students(
  p_query TEXT DEFAULT '', p_department_id UUID DEFAULT NULL,
  p_graduation_year INTEGER DEFAULT NULL, p_registered BOOLEAN DEFAULT NULL,
  p_eligibility TEXT DEFAULT NULL, p_offset INTEGER DEFAULT 0, p_limit INTEGER DEFAULT 500
) RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE result JSONB;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first.' USING ERRCODE = '42501'; END IF;
  IF p_offset IS NULL OR p_limit IS NULL OR p_offset < 0 OR p_limit NOT BETWEEN 1 AND 1000
    OR length(p_query) > 200 OR (p_eligibility IS NOT NULL AND p_eligibility NOT IN ('pending', 'eligible', 'ineligible')) THEN
    RAISE EXCEPTION 'Invalid directory filters or pagination.' USING ERRCODE = '22023';
  END IF;
  WITH matched AS (
    SELECT s.*, jsonb_build_object('id', d.id, 'code', d.code, 'name', d.name) AS department
    FROM public.students s JOIN public.departments d ON d.id = s.department_id
    WHERE (coalesce(p_query, '') = '' OR strpos(lower(s.student_number), lower(p_query)) > 0
      OR strpos(lower(s.full_name), lower(p_query)) > 0 OR strpos(lower(s.email::text), lower(p_query)) > 0)
      AND (p_department_id IS NULL OR s.department_id = p_department_id)
      AND (p_graduation_year IS NULL OR s.graduation_year = p_graduation_year)
      AND (p_registered IS NULL OR s.placement_registered = p_registered)
      AND (p_eligibility IS NULL OR s.eligibility_status = p_eligibility)
  ), page AS (SELECT * FROM matched ORDER BY student_number, id OFFSET p_offset LIMIT p_limit)
  SELECT jsonb_build_object('students', coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY student_number, id) FROM page), '[]'::jsonb),
    'total', (SELECT count(*) FROM matched), 'offset', p_offset, 'limit', p_limit) INTO result;
  RETURN result;
END;
$$;

CREATE FUNCTION public.get_student_import_context()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE result JSONB;
BEGIN
  IF NOT coalesce(public.is_placement_incharge(), FALSE) THEN
    RAISE EXCEPTION 'Only the Placement In-Charge can import students.' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
    'departments', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'code', code) ORDER BY code) FROM public.departments), '[]'::jsonb),
    'existing_students', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'student_number', student_number, 'email', email) ORDER BY student_number) FROM public.students), '[]'::jsonb),
    'min_graduation_year', min_graduation_year, 'max_graduation_year', max_graduation_year, 'max_rows', max_rows
  ) INTO result FROM public.student_import_settings WHERE id = TRUE;
  RETURN result;
END;
$$;

CREATE FUNCTION public.commit_student_import(
  p_rows JSONB, p_confirmed BOOLEAN DEFAULT FALSE, p_mode TEXT DEFAULT 'atomic'
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  cfg public.student_import_settings%ROWTYPE;
  item JSONB; payload JSONB; row_number INTEGER; inserted_id UUID; department UUID;
  row_results JSONB := '[]'; errors JSONB := '[]'; inserted JSONB := '[]';
  successful INTEGER := 0; failed INTEGER := 0; skipped INTEGER := 0; duplicates INTEGER := 0;
  total INTEGER; row_code TEXT; row_field TEXT; row_message TEXT; constraint_name TEXT; detail TEXT;
  history_id UUID; is_duplicate BOOLEAN; outcome TEXT;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(public.is_placement_incharge(), FALSE) THEN
    RAISE EXCEPTION 'Only the Placement In-Charge can import students.' USING ERRCODE = '42501';
  END IF;
  IF p_confirmed IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Confirm the preview before importing.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO cfg FROM public.student_import_settings WHERE id = TRUE;
  IF p_mode IS NULL OR p_mode NOT IN ('atomic', 'partial') OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Expected an array of rows and atomic or partial mode.' USING ERRCODE = '22023';
  END IF;
  total := jsonb_array_length(p_rows);
  IF total < 1 OR total > cfg.max_rows OR cfg.id IS NULL THEN
    RAISE EXCEPTION 'Import is empty or exceeds the configured row limit.' USING ERRCODE = '22023';
  END IF;
  -- Reject ambiguous row identifiers before any write or audit entry.
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) r WHERE jsonb_typeof(r->'source_row') IS DISTINCT FROM 'number'
    OR coalesce(r->>'source_row', '') !~ '^[0-9]{1,9}$') THEN
    RAISE EXCEPTION 'Every source_row must be an integer spreadsheet row number.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) r WHERE (r->>'source_row')::integer < 2)
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) r GROUP BY r->>'source_row' HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Spreadsheet row numbers must be unique and at least 2.' USING ERRCODE = '22023';
  END IF;

  -- Nested block rolls back every inserted row on atomic rejection. Variables
  -- retain row diagnostics so the caller receives useful errors and counts.
  BEGIN
    FOR item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
      row_number := (item->>'source_row')::integer;
      payload := item->'student';
      row_code := NULL; row_field := NULL; row_message := NULL; is_duplicate := FALSE;
      BEGIN
        IF jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN
          RAISE EXCEPTION 'Student row must be an object.' USING ERRCODE = '23514', DETAIL = 'student';
        END IF;
        IF EXISTS (SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN (
          'student_number','full_name','email','department_code','graduation_year','cgpa','phone','backlogs',
          'program','academic_year','section','placement_registered','eligibility_status')) THEN
          RAISE EXCEPTION 'Student import contains unsupported fields.' USING ERRCODE = '23514', DETAIL = 'student';
        END IF;
        FOREACH row_field IN ARRAY ARRAY['student_number','full_name','email','department_code'] LOOP
          IF jsonb_typeof(payload->row_field) IS DISTINCT FROM 'string' OR public.trim_record_text(payload->>row_field) = '' THEN
            RAISE EXCEPTION 'Required field must be nonempty text.' USING ERRCODE = '23514', DETAIL = row_field;
          END IF;
        END LOOP;
        IF coalesce(payload->>'graduation_year', '') !~ '^[0-9]{4}$'
          OR (payload->>'graduation_year')::integer NOT BETWEEN cfg.min_graduation_year AND cfg.max_graduation_year THEN
          RAISE EXCEPTION 'Graduation year is outside the configured range.' USING ERRCODE = '23514', DETAIL = 'graduation_year';
        END IF;
        FOREACH row_field IN ARRAY ARRAY['backlogs','academic_year'] LOOP
          IF payload->>row_field IS NOT NULL AND (payload->>row_field !~ '^[0-9]{1,9}$') THEN
            RAISE EXCEPTION 'Expected a nonnegative integer.' USING ERRCODE = '23514', DETAIL = row_field;
          END IF;
        END LOOP;
        IF payload->>'cgpa' IS NOT NULL AND (payload->>'cgpa' !~ '^[0-9]+(\.[0-9]{1,2})?$'
          OR (payload->>'cgpa')::numeric NOT BETWEEN 0 AND 10) THEN
          RAISE EXCEPTION 'CGPA must be 0 to 10 with at most two decimal places.' USING ERRCODE = '23514', DETAIL = 'cgpa';
        END IF;
        FOREACH row_field IN ARRAY ARRAY['phone','program','section','eligibility_status'] LOOP
          IF payload->>row_field IS NOT NULL AND jsonb_typeof(payload->row_field) <> 'string' THEN
            RAISE EXCEPTION 'Expected text or null.' USING ERRCODE = '23514', DETAIL = row_field;
          END IF;
        END LOOP;
        IF payload ? 'placement_registered' AND jsonb_typeof(payload->'placement_registered') <> 'boolean' THEN
          RAISE EXCEPTION 'Registration must be a boolean.' USING ERRCODE = '23514', DETAIL = 'placement_registered';
        END IF;
        SELECT id INTO department FROM public.departments
          WHERE code = upper(public.trim_record_text(payload->>'department_code')) FOR KEY SHARE;
        IF department IS NULL THEN
          RAISE EXCEPTION 'Department code does not exist.' USING ERRCODE = '23514', DETAIL = 'department_code';
        END IF;
        IF (SELECT count(*) FROM jsonb_array_elements(p_rows) r WHERE public.trim_record_text(r->'student'->>'student_number') = public.trim_record_text(payload->>'student_number')) > 1 THEN
          row_code := 'DUPLICATE_STUDENT_NUMBER'; row_field := 'student_number'; row_message := 'Roll number appears more than once in the uploaded rows.'; is_duplicate := TRUE;
        ELSIF (SELECT count(*) FROM jsonb_array_elements(p_rows) r WHERE lower(public.trim_record_text(r->'student'->>'email')) = lower(public.trim_record_text(payload->>'email'))) > 1 THEN
          row_code := 'DUPLICATE_EMAIL'; row_field := 'email'; row_message := 'Email appears more than once in the uploaded rows.'; is_duplicate := TRUE;
        ELSIF EXISTS (SELECT 1 FROM public.students WHERE student_number = public.trim_record_text(payload->>'student_number')) THEN
          row_code := 'EXISTING_STUDENT_NUMBER'; row_field := 'student_number'; row_message := 'Roll number already exists; nothing was overwritten.'; is_duplicate := TRUE;
        ELSIF EXISTS (SELECT 1 FROM public.students WHERE lower(email::text) = lower(public.trim_record_text(payload->>'email'))) THEN
          row_code := 'EXISTING_EMAIL'; row_field := 'email'; row_message := 'Email already exists; nothing was overwritten.'; is_duplicate := TRUE;
        END IF;
        IF row_code IS NULL THEN
          INSERT INTO public.students(student_number, full_name, email, department_id, graduation_year,
            cgpa, phone, backlogs, program, academic_year, section, placement_registered, eligibility_status)
          VALUES (payload->>'student_number', payload->>'full_name', payload->>'email', department,
            (payload->>'graduation_year')::integer, (payload->>'cgpa')::numeric, payload->>'phone',
            (payload->>'backlogs')::integer, payload->>'program', (payload->>'academic_year')::integer,
            payload->>'section', coalesce((payload->>'placement_registered')::boolean, FALSE),
            coalesce(payload->>'eligibility_status', 'pending')) RETURNING id INTO inserted_id;
        END IF;
      EXCEPTION
        WHEN unique_violation THEN
          GET STACKED DIAGNOSTICS constraint_name = CONSTRAINT_NAME;
          row_field := CASE WHEN constraint_name = 'students_student_number_key' THEN 'student_number' ELSE 'email' END;
          row_code := CASE WHEN row_field = 'student_number' THEN 'EXISTING_STUDENT_NUMBER' ELSE 'EXISTING_EMAIL' END;
          row_message := 'A matching student was inserted concurrently; nothing was overwritten.'; is_duplicate := TRUE;
        WHEN check_violation OR not_null_violation OR invalid_text_representation OR numeric_value_out_of_range OR foreign_key_violation THEN
          GET STACKED DIAGNOSTICS detail = PG_EXCEPTION_DETAIL;
          row_field := CASE WHEN detail IN ('student_number','full_name','email','phone','program','section','user_id','student','department_code','graduation_year','cgpa','backlogs','academic_year','placement_registered','eligibility_status') THEN detail ELSE NULL END;
          row_code := 'INVALID_RECORD'; row_message := 'Record failed trusted validation. Check required text, email, department, year and numeric ranges.';
      END;
      IF row_code IS NULL THEN
        successful := successful + 1;
        inserted := inserted || jsonb_build_array(jsonb_build_object('source_row', row_number, 'student_id', inserted_id));
        row_results := row_results || jsonb_build_array(jsonb_build_object('source_row', row_number, 'status', 'successful', 'student_id', inserted_id, 'errors', '[]'::jsonb));
      ELSE
        IF is_duplicate THEN duplicates := duplicates + 1; END IF;
        outcome := CASE WHEN p_mode = 'partial' AND is_duplicate THEN 'skipped' ELSE 'failed' END;
        IF outcome = 'skipped' THEN skipped := skipped + 1; ELSE failed := failed + 1; END IF;
        errors := errors || jsonb_build_array(jsonb_build_object('source_row', row_number, 'code', row_code, 'field', row_field, 'message', row_message));
        row_results := row_results || jsonb_build_array(jsonb_build_object('source_row', row_number, 'status', outcome, 'errors', jsonb_build_array(jsonb_build_object('code', row_code, 'field', row_field, 'message', row_message))));
      END IF;
    END LOOP;
    IF p_mode = 'atomic' AND failed > 0 THEN
      RAISE EXCEPTION 'ROLLBACK_STUDENT_IMPORT' USING ERRCODE = 'P0001';
    END IF;
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'ROLLBACK_STUDENT_IMPORT' THEN RAISE; END IF;
    skipped := successful; successful := 0; inserted := '[]';
    SELECT coalesce(jsonb_agg(CASE WHEN r->>'status' = 'successful' THEN
      jsonb_build_object('source_row', r->'source_row', 'status', 'skipped', 'errors',
        jsonb_build_array(jsonb_build_object('code', 'ATOMIC_ABORTED', 'field', NULL, 'message', 'Not imported because another row failed.')))
      ELSE r END), '[]'::jsonb) INTO row_results FROM jsonb_array_elements(row_results) r;
  END;

  INSERT INTO public.student_import_history(actor_id, mode, total_count, successful_count, skipped_count, failed_count, duplicate_count)
    VALUES (auth.uid(), p_mode, total, successful, skipped, failed, duplicates) RETURNING id INTO history_id;
  RETURN jsonb_build_object('committed', successful > 0, 'inserted_count', successful,
    'successful_count', successful, 'skipped_count', skipped, 'failed_count', failed,
    'duplicate_count', duplicates, 'total_count', total, 'mode', p_mode, 'history_id', history_id,
    'students', inserted, 'errors', errors, 'row_results', row_results);
END;
$$;

REVOKE ALL ON FUNCTION public.search_students(TEXT, UUID, INTEGER, BOOLEAN, TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_student_import_context() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commit_student_import(JSONB, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_students(TEXT, UUID, INTEGER, BOOLEAN, TEXT, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_import_context() TO authenticated;
GRANT EXECUTE ON FUNCTION public.commit_student_import(JSONB, BOOLEAN, TEXT) TO authenticated;
GRANT SELECT ON public.student_import_history TO authenticated;
GRANT SELECT, UPDATE ON public.student_import_settings TO authenticated;

COMMIT;
