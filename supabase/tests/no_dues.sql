-- Run after all migrations on a disposable Supabase database, with ON_ERROR_STOP.
-- Fixtures and helper functions are rolled back. No pgTAP extension is required.
BEGIN;
CREATE FUNCTION pg_temp.assert_true(ok BOOLEAN) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'No-dues assertion failed'; END IF; END $$;
CREATE FUNCTION pg_temp.expect_error(statement TEXT, expected TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = expected OR (expected = '23503' AND SQLSTATE = '23001') THEN RETURN; END IF;
    RAISE EXCEPTION 'Expected %, got %: %', expected, SQLSTATE, SQLERRM;
  END;
  RAISE EXCEPTION 'Expected error % for %', expected, statement;
END $$;

INSERT INTO auth.users(id) VALUES
 ('11000000-0000-0000-0000-000000000001'),
 ('11000000-0000-0000-0000-000000000002'),
 ('11000000-0000-0000-0000-000000000003'),
 ('11000000-0000-0000-0000-000000000004');
INSERT INTO profiles(id,role) VALUES
 ('11000000-0000-0000-0000-000000000001','placement_incharge'),
 ('11000000-0000-0000-0000-000000000002','student'),
 ('11000000-0000-0000-0000-000000000003','student'),
 ('11000000-0000-0000-0000-000000000004','placement_incharge');
INSERT INTO departments(id,code,name) VALUES
 ('21000000-0000-0000-0000-000000000001','ND-A','Department A'),
 ('21000000-0000-0000-0000-000000000002','ND-B','Department B'),
 ('21000000-0000-0000-0000-000000000003','ND-C','Unconfigured');
INSERT INTO students(id,user_id,student_number,full_name,email,department_id,graduation_year) VALUES
 ('31000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000002','ND1','One','nd1@test.invalid','21000000-0000-0000-0000-000000000001',2027),
 ('31000000-0000-0000-0000-000000000002','11000000-0000-0000-0000-000000000003','ND2','Two','nd2@test.invalid','21000000-0000-0000-0000-000000000001',2028),
 ('31000000-0000-0000-0000-000000000003',NULL,'ND3','Three','nd3@test.invalid','21000000-0000-0000-0000-000000000002',2027),
 ('31000000-0000-0000-0000-000000000004',NULL,'ND4','Four','nd4@test.invalid','21000000-0000-0000-0000-000000000003',2028);
SELECT set_config('request.jwt.claim.sub','11000000-0000-0000-0000-000000000001',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
INSERT INTO clearance_items(id,department_id,name,is_mandatory,is_active) VALUES
 ('41000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001','Library',true,true),
 ('41000000-0000-0000-0000-000000000002','21000000-0000-0000-0000-000000000001','Lab',true,true),
 ('41000000-0000-0000-0000-000000000003','21000000-0000-0000-0000-000000000001','Survey',false,true),
 ('41000000-0000-0000-0000-000000000004','21000000-0000-0000-0000-000000000001','Retired',true,false),
 ('41000000-0000-0000-0000-000000000005','21000000-0000-0000-0000-000000000002','Fees',true,true);
SELECT pg_temp.expect_error($q$INSERT INTO clearance_items(department_id,name) VALUES ('21000000-0000-0000-0000-000000000001','  ')$q$,'23514');
SELECT pg_temp.expect_error($q$UPDATE clearance_items SET department_id='21000000-0000-0000-0000-000000000002' WHERE name='Library'$q$,'23514');
SELECT pg_temp.assert_true((SELECT count(*)=3 FROM initialize_student_clearances('31000000-0000-0000-0000-000000000001')));
-- Initialization is repeatable and never overwrites existing decisions.
SELECT pg_temp.assert_true((SELECT count(*)=3 FROM initialize_student_clearances('31000000-0000-0000-0000-000000000001')));
SELECT pg_temp.assert_true((SELECT count(*)=3 FROM student_clearances));
SELECT pg_temp.assert_true((get_student_no_dues_statement('31000000-0000-0000-0000-000000000001')->>'overall_status')='incomplete');
SELECT pg_temp.assert_true((get_student_no_dues_statement('31000000-0000-0000-0000-000000000001')->>'mandatory_pending')::int=2);
SELECT pg_temp.assert_true(jsonb_array_length(get_student_no_dues_statement('31000000-0000-0000-0000-000000000001')->'items')=3);
SELECT pg_temp.assert_true((get_student_no_dues_statement('31000000-0000-0000-0000-000000000002')->>'mandatory_missing')::int=2);
SELECT pg_temp.assert_true((get_student_no_dues_statement('31000000-0000-0000-0000-000000000004')->>'overall_status')='not_configured');
SELECT pg_temp.assert_true((get_no_dues_progress()->'totals'->>'total_students')::int=4);
SELECT pg_temp.assert_true((get_no_dues_progress()->'totals'->>'incomplete_students')::int=3);
SELECT pg_temp.assert_true((get_no_dues_progress()->'totals'->>'mandatory_missing')::int=3);
SELECT pg_temp.assert_true(jsonb_array_length(get_no_dues_progress()->'by_department')=3);
SELECT pg_temp.assert_true(jsonb_array_length(get_no_dues_progress()->'by_batch')=2);
SELECT pg_temp.assert_true(jsonb_array_length(get_no_dues_progress()->'by_department_batch')=4);
SELECT pg_temp.assert_true((get_no_dues_progress('{}',ARRAY[2027])->'totals'->>'total_students')::int=2);
SELECT pg_temp.assert_true((get_no_dues_progress(ARRAY['21000000-0000-0000-0000-000000000001'::uuid],ARRAY[2028])->'totals'->>'total_students')::int=1);
SELECT pg_temp.assert_true((get_no_dues_progress('{}',ARRAY[2029])->'totals'->>'total_students')::int=0);
SELECT pg_temp.assert_true(get_no_dues_progress('{}',ARRAY[2029])->'totals'->'clearance_rate'->'percent'='null'::jsonb);

UPDATE student_clearances SET status='cleared',approved_at='1900-01-01',updated_at='1900-01-01'
  WHERE student_id='31000000-0000-0000-0000-000000000001' AND clearance_item_id='41000000-0000-0000-0000-000000000001';
SELECT pg_temp.assert_true((SELECT approved_by=auth.uid() AND updated_by=auth.uid() AND approved_at<>'1900-01-01' AND updated_at<>'1900-01-01'
  FROM student_clearances WHERE clearance_item_id='41000000-0000-0000-0000-000000000001'));
UPDATE student_clearances SET status='not_applicable',remarks='No lab assets assigned'
  WHERE student_id='31000000-0000-0000-0000-000000000001' AND clearance_item_id='41000000-0000-0000-0000-000000000002';
UPDATE student_clearances SET status='rejected',remarks='Survey needs revision',pending_requirements=ARRAY['Resubmit survey']
  WHERE student_id='31000000-0000-0000-0000-000000000001' AND clearance_item_id='41000000-0000-0000-0000-000000000003';
SELECT pg_temp.assert_true((get_student_no_dues_statement('31000000-0000-0000-0000-000000000001')->>'overall_status')='cleared');
SELECT pg_temp.assert_true((get_no_dues_progress()->'totals'->>'cleared_students')::int=1);
SELECT pg_temp.assert_true((get_no_dues_progress()->'totals'->'clearance_rate'->>'percent')::numeric=25);
SELECT pg_temp.assert_true((SELECT (g->'clearance_rate'->>'percent')::numeric=50
  FROM jsonb_array_elements(get_no_dues_progress()->'by_department') g WHERE g->>'department_code'='ND-A'));
SELECT pg_temp.assert_true((SELECT (g->>'cleared_students')::int=1 AND (g->>'total_students')::int=2
  FROM jsonb_array_elements(get_no_dues_progress()->'by_batch') g WHERE (g->>'graduation_year')::int=2027));
SELECT pg_temp.assert_true((SELECT sum((g->>'total_students')::int)=4 AND sum((g->>'cleared_students')::int)=1
  FROM jsonb_array_elements(get_no_dues_progress()->'by_department_batch') g));
SELECT pg_temp.assert_true((SELECT count(*)=3 FROM initialize_student_clearances('31000000-0000-0000-0000-000000000001')));
SELECT pg_temp.assert_true((get_student_no_dues_statement('31000000-0000-0000-0000-000000000001')->>'overall_status')='cleared');

CREATE TEMP TABLE previous_decision AS SELECT * FROM student_clearances WHERE clearance_item_id='41000000-0000-0000-0000-000000000001';
SELECT set_config('request.jwt.claim.sub','11000000-0000-0000-0000-000000000004',true);
UPDATE student_clearances SET remarks='Verified again',approved_at='1900-01-01',updated_by='11000000-0000-0000-0000-000000000002'
  WHERE clearance_item_id='41000000-0000-0000-0000-000000000001';
SELECT pg_temp.assert_true((SELECT sc.approved_by=p.approved_by AND sc.approved_at=p.approved_at
  AND sc.updated_by=auth.uid() AND sc.updated_at>p.updated_at FROM student_clearances sc JOIN previous_decision p ON p.id=sc.id));
UPDATE student_clearances SET status='pending',remarks='Return the lab key',pending_requirements=ARRAY['Return lab key']
  WHERE clearance_item_id='41000000-0000-0000-0000-000000000002';
SELECT pg_temp.assert_true((SELECT approved_by IS NULL AND approved_at IS NULL AND updated_by=auth.uid()
  FROM student_clearances WHERE clearance_item_id='41000000-0000-0000-0000-000000000002'));
SELECT pg_temp.assert_true((get_student_no_dues_statement('31000000-0000-0000-0000-000000000001')->>'overall_status')='incomplete');
UPDATE student_clearances SET status='rejected' WHERE clearance_item_id='41000000-0000-0000-0000-000000000002';
SELECT pg_temp.assert_true((get_student_no_dues_statement('31000000-0000-0000-0000-000000000001')->>'mandatory_rejected')::int=1);
SELECT pg_temp.assert_true((get_student_no_dues_statement('31000000-0000-0000-0000-000000000001')->>'overall_status')='incomplete');
SELECT pg_temp.expect_error($q$UPDATE student_clearances SET status='cleared' WHERE clearance_item_id='41000000-0000-0000-0000-000000000002'$q$,'23514');
UPDATE student_clearances SET status='cleared',pending_requirements='{}' WHERE clearance_item_id='41000000-0000-0000-0000-000000000002';
SELECT pg_temp.assert_true((SELECT approved_by=auth.uid() FROM student_clearances WHERE clearance_item_id='41000000-0000-0000-0000-000000000002'));
SELECT pg_temp.assert_true((get_student_no_dues_statement('31000000-0000-0000-0000-000000000001')->>'overall_status')='cleared');

SELECT pg_temp.expect_error($q$INSERT INTO student_clearances(student_id,clearance_item_id,status,approved_by) VALUES ('31000000-0000-0000-0000-000000000002','41000000-0000-0000-0000-000000000001','cleared','11000000-0000-0000-0000-000000000002')$q$,'42501');
SELECT pg_temp.expect_error($q$INSERT INTO student_clearances(student_id,clearance_item_id) VALUES ('31000000-0000-0000-0000-000000000003','41000000-0000-0000-0000-000000000001')$q$,'23514');
SELECT pg_temp.expect_error($q$UPDATE student_clearances SET student_id='31000000-0000-0000-0000-000000000002' WHERE clearance_item_id='41000000-0000-0000-0000-000000000002'$q$,'23514');
SELECT pg_temp.expect_error($q$UPDATE student_clearances SET status='rejected',remarks=NULL,pending_requirements='{}' WHERE clearance_item_id='41000000-0000-0000-0000-000000000002'$q$,'23514');
SELECT pg_temp.expect_error($q$UPDATE student_clearances SET status='pending',pending_requirements=ARRAY['  '] WHERE clearance_item_id='41000000-0000-0000-0000-000000000002'$q$,'23514');
SELECT pg_temp.expect_error($q$UPDATE student_clearances SET status='pending',pending_requirements=ARRAY[NULL::text] WHERE clearance_item_id='41000000-0000-0000-0000-000000000002'$q$,'23514');
SELECT pg_temp.expect_error($q$UPDATE student_clearances SET status='unknown' WHERE clearance_item_id='41000000-0000-0000-0000-000000000002'$q$,'22P02');
SELECT pg_temp.expect_error($q$DELETE FROM clearance_items WHERE id='41000000-0000-0000-0000-000000000001'$q$,'23503');

-- New mandatory configuration affects existing students even before records exist.
INSERT INTO clearance_items(id,department_id,name) VALUES ('41000000-0000-0000-0000-000000000006','21000000-0000-0000-0000-000000000001','Accounts');
SELECT pg_temp.assert_true((get_student_no_dues_statement('31000000-0000-0000-0000-000000000001')->>'overall_status')='incomplete');
SELECT pg_temp.assert_true((get_student_no_dues_statement('31000000-0000-0000-0000-000000000001')->>'mandatory_missing')::int=1);
UPDATE clearance_items SET is_mandatory=false WHERE id='41000000-0000-0000-0000-000000000006';
SELECT pg_temp.assert_true((get_student_no_dues_statement('31000000-0000-0000-0000-000000000001')->>'overall_status')='cleared');
UPDATE clearance_items SET is_mandatory=true,is_active=false WHERE id='41000000-0000-0000-0000-000000000006';
SELECT pg_temp.assert_true((get_student_no_dues_statement('31000000-0000-0000-0000-000000000001')->>'overall_status')='cleared');

-- A student can read only their statement/records and cannot mutate even remarks.
SELECT set_config('request.jwt.claim.sub','11000000-0000-0000-0000-000000000002',true);
SELECT pg_temp.assert_true((get_student_no_dues_statement('31000000-0000-0000-0000-000000000001')->>'overall_status')='cleared');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM get_no_dues_student_summary()));
SELECT pg_temp.expect_error($q$SELECT get_student_no_dues_statement('31000000-0000-0000-0000-000000000002')$q$,'42501');
SELECT pg_temp.expect_error($q$SELECT get_student_no_dues_statement(NULL)$q$,'22023');
SELECT pg_temp.expect_error($q$SELECT get_no_dues_progress()$q$,'42501');
SELECT pg_temp.expect_error($q$SELECT initialize_student_clearances('31000000-0000-0000-0000-000000000001')$q$,'42501');
SELECT pg_temp.expect_error($q$INSERT INTO clearance_items(department_id,name) VALUES ('21000000-0000-0000-0000-000000000001','Self Approval')$q$,'42501');
SELECT pg_temp.expect_error($q$INSERT INTO student_clearances(student_id,clearance_item_id,status) VALUES ('31000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000006','cleared')$q$,'42501');
WITH changed AS (UPDATE student_clearances SET status='cleared',remarks='Self approved',pending_requirements='{}' RETURNING id)
 SELECT pg_temp.assert_true((SELECT count(*)=0 FROM changed));
WITH changed AS (DELETE FROM student_clearances RETURNING id)
 SELECT pg_temp.assert_true((SELECT count(*)=0 FROM changed));
WITH changed AS (UPDATE clearance_items SET is_mandatory=false RETURNING id)
 SELECT pg_temp.assert_true((SELECT count(*)=0 FROM changed));

SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claim.role','anon',true);
SET LOCAL ROLE anon;
SELECT pg_temp.expect_error($q$SELECT get_student_no_dues_statement('31000000-0000-0000-0000-000000000001')$q$,'42501');
SELECT pg_temp.expect_error($q$SELECT get_no_dues_progress()$q$,'42501');
SELECT pg_temp.expect_error($q$SELECT initialize_student_clearances('31000000-0000-0000-0000-000000000001')$q$,'42501');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM student_clearances));
ROLLBACK;
