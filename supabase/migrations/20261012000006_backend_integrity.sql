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

CREATE FUNCTION commit_student_import(p_rows JSONB) RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r JSONB; s JSONB; source_row INTEGER; department UUID; imported_id UUID;
  imported JSONB := '[]'; current_source INTEGER; error_code TEXT; error_message TEXT;
BEGIN
  IF auth.uid() IS NULL OR NOT is_placement_incharge() THEN
    RAISE EXCEPTION 'Only placement in-charge imports students' USING ERRCODE = '42501';
  END IF;
  -- This exception block is a subtransaction: any bad row/unique race rolls back
  -- every insertion and returns a safe validation result, never SQL or private data.
  BEGIN
    IF p_rows IS NULL OR jsonb_typeof(p_rows)<>'array' THEN
      RAISE EXCEPTION 'Expected import rows' USING ERRCODE='23514';
    END IF;
    IF jsonb_array_length(p_rows) NOT BETWEEN 1 AND 10000 THEN
      RAISE EXCEPTION 'Invalid import size' USING ERRCODE='23514';
    END IF;
    FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
      IF jsonb_typeof(r)<>'object' OR jsonb_typeof(r->'source_row') IS DISTINCT FROM 'number'
        OR jsonb_typeof(r->'student') IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'Invalid import row shape' USING ERRCODE='23514';
      END IF;
      IF (r->>'source_row')::NUMERIC<>trunc((r->>'source_row')::NUMERIC)
        OR (r->>'source_row')::NUMERIC NOT BETWEEN 2 AND 2147483647 THEN
        RAISE EXCEPTION 'Invalid source row' USING ERRCODE='23514';
      END IF;
      source_row := (r->>'source_row')::INTEGER; current_source := source_row; s := r->'student';
      IF EXISTS (SELECT 1 FROM jsonb_object_keys(r) k WHERE k NOT IN ('source_row','student'))
        OR EXISTS (SELECT 1 FROM jsonb_object_keys(s) k WHERE k NOT IN
          ('student_number','full_name','email','department_code','graduation_year','cgpa','phone'))
        OR EXISTS (SELECT 1 FROM jsonb_array_elements(imported) x WHERE (x->>'source_row')::INTEGER=source_row) THEN
        RAISE EXCEPTION 'Unsupported fields or duplicate source row' USING ERRCODE='23514';
      END IF;
      IF jsonb_typeof(s->'student_number') IS DISTINCT FROM 'string'
        OR jsonb_typeof(s->'full_name') IS DISTINCT FROM 'string'
        OR jsonb_typeof(s->'email') IS DISTINCT FROM 'string'
        OR jsonb_typeof(s->'department_code') IS DISTINCT FROM 'string'
        OR jsonb_typeof(s->'graduation_year') IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION 'Invalid required field types' USING ERRCODE='23514';
      END IF;
      IF (s->>'graduation_year')::NUMERIC<>trunc((s->>'graduation_year')::NUMERIC)
        OR (s->>'graduation_year')::NUMERIC NOT BETWEEN 1901 AND 2099 THEN
        RAISE EXCEPTION 'Invalid graduation year' USING ERRCODE='23514';
      END IF;
      IF s ? 'cgpa' AND jsonb_typeof(s->'cgpa') <> 'null' THEN
        IF jsonb_typeof(s->'cgpa') <> 'number' THEN
          RAISE EXCEPTION 'CGPA must be numeric or null' USING ERRCODE='23514';
        END IF;
        IF (s->>'cgpa')::NUMERIC NOT BETWEEN 0 AND 10 THEN
          RAISE EXCEPTION 'CGPA out of range' USING ERRCODE='23514';
        END IF;
      END IF;
      IF s ? 'phone' AND jsonb_typeof(s->'phone') NOT IN ('null','string') THEN
        RAISE EXCEPTION 'Phone must be text or null' USING ERRCODE='23514';
      END IF;
      SELECT id INTO department FROM departments WHERE upper(campus_trim(code))=upper(campus_trim(s->>'department_code'));
      IF department IS NULL THEN RAISE EXCEPTION 'Unknown department' USING ERRCODE='23514'; END IF;
      INSERT INTO students(student_number,full_name,email,department_id,graduation_year,cgpa,phone)
        VALUES (s->>'student_number',s->>'full_name',s->>'email',department,
          (s->>'graduation_year')::INTEGER,(s->>'cgpa')::NUMERIC,s->>'phone') RETURNING id INTO imported_id;
      imported := imported || jsonb_build_array(jsonb_build_object('source_row',source_row,'student_id',imported_id));
    END LOOP;
  EXCEPTION WHEN unique_violation OR foreign_key_violation OR check_violation OR invalid_text_representation OR numeric_value_out_of_range OR not_null_violation THEN
    error_code := CASE WHEN SQLSTATE IN ('23505','23503') THEN 'CONFLICT' ELSE 'INVALID_INPUT' END;
    error_message := CASE WHEN SQLSTATE='23505' THEN 'Duplicate student number or email.'
      WHEN SQLSTATE='23503' THEN 'Department configuration changed; retry import.' ELSE 'Invalid student import row or batch.' END;
    RETURN jsonb_build_object('committed',false,'inserted_count',0,'students','[]'::JSONB,
      'errors',jsonb_build_array(jsonb_build_object('code',error_code,'field',NULL,'message',error_message,'source_row',current_source)));
  END;
  RETURN jsonb_build_object('committed',true,'inserted_count',jsonb_array_length(imported),'students',imported,'errors','[]'::JSONB);
END;
$$;
REVOKE ALL ON FUNCTION commit_student_import(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commit_student_import(JSONB) TO authenticated;
COMMIT;
