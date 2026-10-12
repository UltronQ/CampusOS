-- Run against a disposable Supabase database after all migrations:
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/recruitment.sql
-- Entire fixture rolls back. No pgTAP extension required.
BEGIN;
CREATE FUNCTION pg_temp.expect_error(statement TEXT, expected TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = expected OR (expected = '23503' AND SQLSTATE = '23001') THEN RETURN; END IF;
    RAISE EXCEPTION 'Expected %, got %: %', expected, SQLSTATE, SQLERRM;
  END;
  RAISE EXCEPTION 'Expected error % for %', expected, statement;
END $$;
CREATE FUNCTION pg_temp.assert_true(ok BOOLEAN) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Assertion failed'; END IF; END $$;

INSERT INTO auth.users (id) VALUES
 ('10000000-0000-0000-0000-000000000001'),
 ('10000000-0000-0000-0000-000000000002'),
 ('10000000-0000-0000-0000-000000000003');
INSERT INTO profiles (id,role) VALUES
 ('10000000-0000-0000-0000-000000000001','placement_incharge'),
 ('10000000-0000-0000-0000-000000000002','student'),
 ('10000000-0000-0000-0000-000000000003','student');
INSERT INTO departments (id,code,name) VALUES ('20000000-0000-0000-0000-000000000001','TEST-M23','Test');
INSERT INTO students (id,user_id,student_number,full_name,email,department_id,graduation_year,cgpa,backlogs) VALUES
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','M23-1','One','m23-1@test.invalid','20000000-0000-0000-0000-000000000001',2027,8,0),
 ('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003','M23-2','Two','m23-2@test.invalid','20000000-0000-0000-0000-000000000001',2027,6,2);
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
INSERT INTO companies (id,name) VALUES ('40000000-0000-0000-0000-000000000001','Test Co');
INSERT INTO drives (id,company_id,title,start_date,department_ids,graduation_years,minimum_cgpa,maximum_backlogs) VALUES
 ('50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','Test Drive','2026-10-12',ARRAY['20000000-0000-0000-0000-000000000001'::uuid],ARRAY[2027],8,0);
UPDATE drives SET status='published' WHERE id='50000000-0000-0000-0000-000000000001';
SELECT pg_temp.expect_error($q$UPDATE drives SET status='draft' WHERE id='50000000-0000-0000-0000-000000000001'$q$,'23514');
SELECT pg_temp.expect_error($q$DELETE FROM companies WHERE id='40000000-0000-0000-0000-000000000001'$q$,'23503');
CREATE FUNCTION pg_temp.check_eligibility() RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE s students; d drives;
BEGIN
 SELECT * INTO s FROM students WHERE id='30000000-0000-0000-0000-000000000001';
 SELECT * INTO d FROM drives WHERE id='50000000-0000-0000-0000-000000000001';
 PERFORM pg_temp.assert_true(recruitment_eligible(s,d));
 s.department_id := '20000000-0000-0000-0000-000000000002';
 PERFORM pg_temp.assert_true(NOT recruitment_eligible(s,d));
 s.department_id := d.department_ids[1]; s.graduation_year := 2028;
 PERFORM pg_temp.assert_true(NOT recruitment_eligible(s,d));
 s.graduation_year := 2027; s.cgpa := 7.99;
 PERFORM pg_temp.assert_true(NOT recruitment_eligible(s,d));
 s.cgpa := NULL;
 PERFORM pg_temp.assert_true(NOT recruitment_eligible(s,d));
 s.cgpa := 8; s.backlogs := 1;
 PERFORM pg_temp.assert_true(NOT recruitment_eligible(s,d));
 s.backlogs := NULL;
 PERFORM pg_temp.assert_true(NOT recruitment_eligible(s,d));
 d.department_ids := '{}'; d.graduation_years := '{}';
 d.minimum_cgpa := NULL; d.maximum_backlogs := NULL;
 PERFORM pg_temp.assert_true(recruitment_eligible(s,d));
END $$;
SELECT pg_temp.check_eligibility();
SELECT pg_temp.expect_error($q$UPDATE drives SET minimum_cgpa=7 WHERE id='50000000-0000-0000-0000-000000000001'$q$,'23514');

SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM get_student_drives('30000000-0000-0000-0000-000000000002')));
SELECT pg_temp.expect_error($q$INSERT INTO applications(student_id,drive_id) VALUES ('30000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000001')$q$,'23514');
SELECT pg_temp.expect_error($q$SELECT * FROM get_student_drives('30000000-0000-0000-0000-000000000001')$q$,'42501');

SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM get_student_drives('30000000-0000-0000-0000-000000000001')));
INSERT INTO applications(id,student_id,drive_id) VALUES ('60000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001');
SELECT pg_temp.expect_error($q$UPDATE applications SET status='selected' WHERE id='60000000-0000-0000-0000-000000000001'$q$,'42501');
SELECT pg_temp.expect_error($q$UPDATE applications SET applied_at=applied_at + interval '1 day' WHERE id='60000000-0000-0000-0000-000000000001'$q$,'23514');
SELECT pg_temp.expect_error($q$INSERT INTO applications(student_id,drive_id) VALUES ('30000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000001')$q$,'42501');
SELECT pg_temp.expect_error($q$INSERT INTO applications(student_id,drive_id) VALUES ('30000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001')$q$,'23505');

SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
SELECT pg_temp.expect_error($q$INSERT INTO offers(application_id) VALUES ('60000000-0000-0000-0000-000000000001')$q$,'23514');
UPDATE applications SET status='selected' WHERE id='60000000-0000-0000-0000-000000000001';
INSERT INTO offers(id,application_id,annual_ctc_minor) VALUES ('70000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001',100000000);
SELECT pg_temp.assert_true((SELECT successful_offers=1 AND placed_students=1 FROM get_recruitment_success_counts()));
SELECT pg_temp.expect_error($q$DELETE FROM applications WHERE id='60000000-0000-0000-0000-000000000001'$q$,'23503');
SELECT pg_temp.expect_error($q$DELETE FROM drives WHERE id='50000000-0000-0000-0000-000000000001'$q$,'23503');

SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
WITH changed AS (UPDATE applications SET status='withdrawn' WHERE id='60000000-0000-0000-0000-000000000001' RETURNING id)
 SELECT pg_temp.assert_true((SELECT count(*)=0 FROM changed));
WITH changed AS (UPDATE offers SET status='accepted' WHERE id='70000000-0000-0000-0000-000000000001' RETURNING id)
 SELECT pg_temp.assert_true((SELECT count(*)=0 FROM changed));

SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
SELECT pg_temp.expect_error($q$UPDATE offers SET annual_ctc_minor=1 WHERE id='70000000-0000-0000-0000-000000000001'$q$,'42501');
UPDATE offers SET status='accepted' WHERE id='70000000-0000-0000-0000-000000000001';
SELECT pg_temp.expect_error($q$UPDATE offers SET status='revoked' WHERE id='70000000-0000-0000-0000-000000000001'$q$,'42501');
SELECT pg_temp.expect_error($q$INSERT INTO offers(application_id) VALUES ('60000000-0000-0000-0000-000000000001')$q$,'42501');
SELECT pg_temp.expect_error($q$UPDATE offers SET status='declined' WHERE id='70000000-0000-0000-0000-000000000001'$q$,'23514');
UPDATE applications SET status='withdrawn' WHERE id='60000000-0000-0000-0000-000000000001';
SELECT pg_temp.assert_true((SELECT successful_offers=0 AND placed_students=0 FROM get_recruitment_success_counts()));
SELECT pg_temp.expect_error($q$UPDATE applications SET status='applied' WHERE id='60000000-0000-0000-0000-000000000001'$q$,'42501');

SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
-- Restore fixture only by creating a second drive/application, never reopening terminals.
INSERT INTO drives(id,company_id,title,start_date) VALUES ('50000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001','Cancel Test','2026-10-12');
UPDATE drives SET status='published' WHERE id='50000000-0000-0000-0000-000000000002';
INSERT INTO applications(id,student_id,drive_id) VALUES ('60000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002');
UPDATE applications SET status='selected' WHERE id='60000000-0000-0000-0000-000000000002';
INSERT INTO offers(id,application_id) VALUES ('70000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000002');
UPDATE drives SET status='cancelled' WHERE id='50000000-0000-0000-0000-000000000002';
SELECT pg_temp.assert_true((SELECT successful_offers=0 FROM get_recruitment_success_counts()));
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
SELECT pg_temp.expect_error($q$UPDATE offers SET status='accepted' WHERE id='70000000-0000-0000-0000-000000000002'$q$,'23514');
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
UPDATE offers SET status='revoked' WHERE id='70000000-0000-0000-0000-000000000002';
SELECT pg_temp.expect_error($q$UPDATE offers SET status='offered' WHERE id='70000000-0000-0000-0000-000000000002'$q$,'23514');
DELETE FROM offers WHERE application_id='60000000-0000-0000-0000-000000000002';
DELETE FROM applications WHERE id='60000000-0000-0000-0000-000000000002';
DELETE FROM drives WHERE id='50000000-0000-0000-0000-000000000002';
ROLLBACK;
