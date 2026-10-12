-- Combined M2-2/M2-5 contract: numeric JSON fields remain typed at the trusted boundary.
-- Preserve confirmation, configured limits, atomic/partial handling and audit counts.
BEGIN;
-- Preserve meaningful per-field diagnostics when the M2-5 normalization trigger
-- runs before M2-2's validator. Validation must not erase the row's error field.
CREATE OR REPLACE FUNCTION public.normalize_student_record() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public,pg_temp AS $$
BEGIN
  NEW.student_number := public.campus_trim(NEW.student_number);
  NEW.full_name := public.campus_trim(NEW.full_name);
  NEW.email := lower(public.campus_trim(NEW.email::TEXT));
  NEW.phone := nullif(public.campus_trim(NEW.phone),'');
  IF NEW.student_number IS NULL OR length(NEW.student_number) NOT BETWEEN 1 AND 128 THEN
    RAISE EXCEPTION 'Invalid student roll number' USING ERRCODE='23514', DETAIL='student_number';
  END IF;
  IF NEW.full_name IS NULL OR length(NEW.full_name) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Invalid student name' USING ERRCODE='23514', DETAIL='full_name';
  END IF;
  IF NEW.email IS NULL OR length(NEW.email::TEXT)>320
    OR NEW.email::TEXT !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Invalid student email' USING ERRCODE='23514', DETAIL='email';
  END IF;
  IF NEW.phone IS NOT NULL AND (NEW.phone !~ '^\+?[0-9 ()-]+$'
    OR length(regexp_replace(NEW.phone,'[^0-9]','','g')) NOT BETWEEN 7 AND 15) THEN
    RAISE EXCEPTION 'Invalid student phone' USING ERRCODE='23514', DETAIL='phone';
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.commit_student_import(
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
        IF jsonb_typeof(payload->'graduation_year') IS DISTINCT FROM 'number' THEN
          RAISE EXCEPTION 'Graduation year must be a number.' USING ERRCODE = '23514', DETAIL = 'graduation_year';
        END IF;
        FOREACH row_field IN ARRAY ARRAY['cgpa','backlogs','academic_year'] LOOP
          IF payload ? row_field AND jsonb_typeof(payload->row_field) NOT IN ('number','null') THEN
            RAISE EXCEPTION 'Expected a numeric value or null.' USING ERRCODE = '23514', DETAIL = row_field;
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
REVOKE ALL ON FUNCTION public.commit_student_import(JSONB, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commit_student_import(JSONB, BOOLEAN, TEXT) TO authenticated;
COMMIT;
