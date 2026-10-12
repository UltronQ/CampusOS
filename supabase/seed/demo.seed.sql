-- M3-5 deterministic demonstration dataset: 3 departments, 30 students, 5 drives.
-- Run after all migrations as the trusted table owner on a development project.
-- Provision a real placement_incharge profile first. This file creates no Auth users/roles.
-- Existing records are never overwritten; exact expected counts assume an otherwise empty demo project.
BEGIN;
DO $$ DECLARE actor uuid; BEGIN
  SELECT id INTO actor FROM public.profiles WHERE role='placement_incharge' ORDER BY id LIMIT 1;
  IF actor IS NULL THEN RAISE EXCEPTION 'Provision a real in-charge Auth user/profile before demo seeding.' USING ERRCODE='42501'; END IF;
  PERFORM set_config('campusos.demo_actor',actor::text,true);
END $$;
CREATE TEMP TABLE campusos_demo_guard_state ON COMMIT DROP AS
SELECT tgrelid,tgname,tgenabled FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN
  ('public.drives'::regclass,'public.applications'::regclass,'public.offers'::regclass,
   'public.clearance_items'::regclass,'public.student_clearances'::regclass,
   'public.recruitment_stages'::regclass,'public.application_stage_results'::regclass)
  AND tgname IN ('guard_drive','guard_application','guard_offer','guard_clearance_item','guard_student_clearance','guard_stage','guard_stage_result');
DO $$ DECLARE item record; BEGIN
  FOR item IN SELECT * FROM campusos_demo_guard_state LOOP
    EXECUTE format('ALTER TABLE %s DISABLE TRIGGER %I',item.tgrelid::regclass,item.tgname);
  END LOOP;
END $$;

INSERT INTO public.departments (id,code,name) VALUES
  ('11111111-1111-1111-1111-111111111111','CSE','Computer Science'),
  ('22222222-2222-2222-2222-222222222222','ECE','Electronics'),
  ('33333333-3333-3333-3333-333333333333','ME','Mechanical')
ON CONFLICT DO NOTHING;

INSERT INTO public.companies (id,name) VALUES
  ('91000000-0000-0000-0000-000000000001','Demo Meridian Labs'),
  ('91000000-0000-0000-0000-000000000002','Demo Northstar Systems'),
  ('91000000-0000-0000-0000-000000000003','Demo Circuit Works'),
  ('91000000-0000-0000-0000-000000000004','Demo Workshop Group'),
  ('91000000-0000-0000-0000-000000000005','Demo Horizon Engineering')
ON CONFLICT DO NOTHING;

INSERT INTO public.students (id,student_number,full_name,email,department_id,graduation_year,cgpa,backlogs,phone,placement_registered,eligibility_status,program,academic_year,section) VALUES
  ('90000000-0000-0000-0000-000000000001','DEMO-001','Demo Student 01','campusos.student01@example.test','11111111-1111-1111-1111-111111111111',2027,9,0,NULL,true,'eligible','B.Tech',4,'Demo'),
  ('90000000-0000-0000-0000-000000000002','DEMO-002','Demo Student 02','campusos.student02@example.test','11111111-1111-1111-1111-111111111111',2028,9,0,NULL,true,'eligible','B.Tech',4,'Demo'),
  ('90000000-0000-0000-0000-000000000003','DEMO-003','Demo Student 03','campusos.student03@example.test','11111111-1111-1111-1111-111111111111',2027,7.2,3,NULL,true,'eligible','B.Tech',4,'Demo'),
  ('90000000-0000-0000-0000-000000000004','DEMO-004','Demo Student 04','campusos.student04@example.test','11111111-1111-1111-1111-111111111111',2028,7.6,0,NULL,true,'eligible','B.Tech',4,'Demo'),
  ('90000000-0000-0000-0000-000000000005','DEMO-005','Demo Student 05','campusos.student05@example.test','11111111-1111-1111-1111-111111111111',2027,8,1,NULL,false,'ineligible','B.Tech',4,'Demo'),
  ('90000000-0000-0000-0000-000000000006','DEMO-006','Demo Student 06','campusos.student06@example.test','11111111-1111-1111-1111-111111111111',2028,8.4,2,NULL,true,'eligible','B.Tech',4,'Demo'),
  ('90000000-0000-0000-0000-000000000007','DEMO-007','Demo Student 07','campusos.student07@example.test','11111111-1111-1111-1111-111111111111',2027,8.8,3,NULL,true,'eligible','B.Tech',4,'Demo'),
  ('90000000-0000-0000-0000-000000000008','DEMO-008','Demo Student 08','campusos.student08@example.test','11111111-1111-1111-1111-111111111111',2028,9.2,0,NULL,true,'eligible','B.Tech',4,'Demo'),
  ('90000000-0000-0000-0000-000000000009','DEMO-009','Demo Student 09','campusos.student09@example.test','11111111-1111-1111-1111-111111111111',2027,6,1,NULL,true,'eligible','B.Tech',4,'Demo'),
  ('90000000-0000-0000-0000-000000000010','DEMO-010','Demo Student 10','campusos.student10@example.test','11111111-1111-1111-1111-111111111111',2028,6.4,2,NULL,false,'ineligible','B.Tech',4,'Demo'),
  ('90000000-0000-0000-0000-000000000011','DEMO-011','Demo Student 11','campusos.student11@example.test','22222222-2222-2222-2222-222222222222',2027,6.8,3,NULL,true,'eligible','B.Tech',4,'Demo'),
  ('90000000-0000-0000-0000-000000000012','DEMO-012','Demo Student 12','campusos.student12@example.test','22222222-2222-2222-2222-222222222222',2028,7.2,0,NULL,true,'eligible','B.Tech',4,'Demo'),
  ('90000000-0000-0000-0000-000000000013','DEMO-013','Demo Student 13','campusos.student13@example.test','22222222-2222-2222-2222-222222222222',2027,7.6,1,NULL,true,'eligible','B.Tech',4,'Demo'),
  ('90000000-0000-0000-0000-000000000014','DEMO-014','Demo Student 14','campusos.student14@example.test','22222222-2222-2222-2222-222222222222',2028,8,2,NULL,true,'eligible','B.Tech',4,'Demo'),
  ('90000000-0000-0000-0000-000000000015','DEMO-015','Demo Student 15','campusos.student15@example.test','22222222-2222-2222-2222-222222222222',2027,8.4,3,NULL,false,'ineligible','B.Tech',4,'Demo'),
  ('90000000-0000-0000-0000-000000000016','DEMO-016','Demo Student 16','campusos.student16@example.test','22222222-2222-2222-2222-222222222222',2028,8.8,0,NULL,true,'eligible','B.Tech',4,'Demo'),
  ('90000000-0000-0000-0000-000000000017','DEMO-017','Demo Student 17','campusos.student17@example.test','22222222-2222-2222-2222-222222222222',2027,9.2,1,NULL,true,'eligible','B.Tech',4,'Demo'),
  ('90000000-0000-0000-0000-000000000018','DEMO-018','Demo Student 18','campusos.student18@example.test','22222222-2222-2222-2222-222222222222',2028,6,2,NULL,true,'eligible','B.Tech',4,'Demo'),
  ('90000000-0000-0000-0000-000000000019','DEMO-019','Demo Student 19','campusos.student19@example.test','22222222-2222-2222-2222-222222222222',2027,6.4,3,NULL,true,'eligible','B.Tech',4,'Demo'),
  ('90000000-0000-0000-0000-000000000020','DEMO-020','Demo Student 20','campusos.student20@example.test','22222222-2222-2222-2222-222222222222',2028,6.8,0,NULL,false,'ineligible','B.Tech',4,'Demo'),
  ('90000000-0000-0000-0000-000000000021','DEMO-021','Demo Student 21','campusos.student21@example.test','33333333-3333-3333-3333-333333333333',2027,7.2,1,NULL,true,'eligible','B.Tech',4,'Demo'),
  ('90000000-0000-0000-0000-000000000022','DEMO-022','Demo Student 22','campusos.student22@example.test','33333333-3333-3333-3333-333333333333',2028,7.6,2,NULL,true,'eligible','B.Tech',4,'Demo'),
  ('90000000-0000-0000-0000-000000000023','DEMO-023','Demo Student 23','campusos.student23@example.test','33333333-3333-3333-3333-333333333333',2027,8,3,NULL,true,'eligible','B.Tech',4,'Demo'),
  ('90000000-0000-0000-0000-000000000024','DEMO-024','Demo Student 24','campusos.student24@example.test','33333333-3333-3333-3333-333333333333',2028,8.4,0,NULL,true,'eligible','B.Tech',4,'Demo'),
  ('90000000-0000-0000-0000-000000000025','DEMO-025','Demo Student 25','campusos.student25@example.test','33333333-3333-3333-3333-333333333333',2027,8.8,1,NULL,false,'ineligible','B.Tech',4,'Demo'),
  ('90000000-0000-0000-0000-000000000026','DEMO-026','Demo Student 26','campusos.student26@example.test','33333333-3333-3333-3333-333333333333',2028,9.2,2,NULL,true,'eligible','B.Tech',4,'Demo'),
  ('90000000-0000-0000-0000-000000000027','DEMO-027','Demo Student 27','campusos.student27@example.test','33333333-3333-3333-3333-333333333333',2027,6,3,NULL,true,'eligible','B.Tech',4,'Demo'),
  ('90000000-0000-0000-0000-000000000028','DEMO-028','Demo Student 28','campusos.student28@example.test','33333333-3333-3333-3333-333333333333',2028,6.4,0,NULL,true,'eligible','B.Tech',4,'Demo'),
  ('90000000-0000-0000-0000-000000000029','DEMO-029','Demo Student 29','campusos.student29@example.test','33333333-3333-3333-3333-333333333333',2027,6.8,1,NULL,true,'eligible','B.Tech',4,'Demo'),
  ('90000000-0000-0000-0000-000000000030','DEMO-030','Demo Student 30','campusos.student30@example.test','33333333-3333-3333-3333-333333333333',2028,7.2,2,NULL,false,'ineligible','B.Tech',4,'Demo')
ON CONFLICT DO NOTHING;

INSERT INTO public.drives (id,company_id,title,status,start_date,department_ids,graduation_years,minimum_cgpa,maximum_backlogs,eligible_graduation_years,min_cgpa,max_backlogs) VALUES
  ('92000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000001','Demo CSE Engineering','published','2026-10-01',ARRAY['11111111-1111-1111-1111-111111111111']::uuid[],ARRAY[2027,2028]::integer[],7,1,ARRAY[2027,2028]::integer[],7,1),
  ('92000000-0000-0000-0000-000000000002','91000000-0000-0000-0000-000000000002','Demo All-Department Associates','completed','2026-10-03',ARRAY[]::uuid[],ARRAY[2027,2028]::integer[],6,3,ARRAY[2027,2028]::integer[],6,3),
  ('92000000-0000-0000-0000-000000000003','91000000-0000-0000-0000-000000000003','Demo Cancelled ECE Drive','cancelled','2026-10-05',ARRAY['22222222-2222-2222-2222-222222222222']::uuid[],ARRAY[2027,2028]::integer[],7,1,ARRAY[2027,2028]::integer[],7,1),
  ('92000000-0000-0000-0000-000000000004','91000000-0000-0000-0000-000000000004','Demo Planned ME Drive','draft','2026-10-20',ARRAY['33333333-3333-3333-3333-333333333333']::uuid[],ARRAY[]::integer[],NULL,NULL,ARRAY[]::integer[],NULL,NULL),
  ('92000000-0000-0000-0000-000000000005','91000000-0000-0000-0000-000000000005','Demo ME Graduate Engineer','published','2026-10-10',ARRAY['33333333-3333-3333-3333-333333333333']::uuid[],ARRAY[2028]::integer[],7,1,ARRAY[2028]::integer[],7,1)
ON CONFLICT DO NOTHING;

INSERT INTO public.drive_departments (drive_id,department_id) VALUES
  ('92000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111'),
  ('92000000-0000-0000-0000-000000000003','22222222-2222-2222-2222-222222222222'),
  ('92000000-0000-0000-0000-000000000004','33333333-3333-3333-3333-333333333333'),
  ('92000000-0000-0000-0000-000000000005','33333333-3333-3333-3333-333333333333')
ON CONFLICT DO NOTHING;

INSERT INTO public.recruitment_stages (id,drive_id,name,sequence) VALUES
  ('97000000-0000-0000-0000-000000000001','92000000-0000-0000-0000-000000000001','Demo Interview',1),
  ('97000000-0000-0000-0000-000000000002','92000000-0000-0000-0000-000000000002','Demo Technical Round',1)
ON CONFLICT DO NOTHING;

INSERT INTO public.applications (id,student_id,drive_id,status) VALUES
  ('93000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','92000000-0000-0000-0000-000000000001','selected'),
  ('93000000-0000-0000-0000-000000000002','90000000-0000-0000-0000-000000000001','92000000-0000-0000-0000-000000000002','selected'),
  ('93000000-0000-0000-0000-000000000003','90000000-0000-0000-0000-000000000002','92000000-0000-0000-0000-000000000001','selected'),
  ('93000000-0000-0000-0000-000000000004','90000000-0000-0000-0000-000000000003','92000000-0000-0000-0000-000000000002','in_progress'),
  ('93000000-0000-0000-0000-000000000005','90000000-0000-0000-0000-000000000012','92000000-0000-0000-0000-000000000003','selected'),
  ('93000000-0000-0000-0000-000000000006','90000000-0000-0000-0000-000000000004','92000000-0000-0000-0000-000000000002','withdrawn'),
  ('93000000-0000-0000-0000-000000000007','90000000-0000-0000-0000-000000000024','92000000-0000-0000-0000-000000000005','selected'),
  ('93000000-0000-0000-0000-000000000008','90000000-0000-0000-0000-000000000005','92000000-0000-0000-0000-000000000002','selected'),
  ('93000000-0000-0000-0000-000000000009','90000000-0000-0000-0000-000000000006','92000000-0000-0000-0000-000000000002','rejected'),
  ('93000000-0000-0000-0000-000000000010','90000000-0000-0000-0000-000000000013','92000000-0000-0000-0000-000000000002','applied'),
  ('93000000-0000-0000-0000-000000000011','90000000-0000-0000-0000-000000000021','92000000-0000-0000-0000-000000000002','selected'),
  ('93000000-0000-0000-0000-000000000012','90000000-0000-0000-0000-000000000022','92000000-0000-0000-0000-000000000002','selected')
ON CONFLICT DO NOTHING;

INSERT INTO public.application_stage_results (id,application_id,stage_id,status,published_at) VALUES
  ('98000000-0000-0000-0000-000000000001','93000000-0000-0000-0000-000000000001','97000000-0000-0000-0000-000000000001','passed','2026-10-12T09:00:00.000Z'),
  ('98000000-0000-0000-0000-000000000002','93000000-0000-0000-0000-000000000002','97000000-0000-0000-0000-000000000002','pending',NULL)
ON CONFLICT DO NOTHING;

INSERT INTO public.offers (id,application_id,status,annual_ctc_minor,currency) VALUES
  ('95000000-0000-0000-0000-000000000001','93000000-0000-0000-0000-000000000001','offered',80000000,'INR'),
  ('95000000-0000-0000-0000-000000000002','93000000-0000-0000-0000-000000000002','accepted',120000000,'INR'),
  ('95000000-0000-0000-0000-000000000003','93000000-0000-0000-0000-000000000003','accepted',100000000,'INR'),
  ('95000000-0000-0000-0000-000000000004','93000000-0000-0000-0000-000000000005','accepted',990000000,'INR'),
  ('95000000-0000-0000-0000-000000000005','93000000-0000-0000-0000-000000000006','accepted',880000000,'INR'),
  ('95000000-0000-0000-0000-000000000006','93000000-0000-0000-0000-000000000007','accepted',NULL,'INR'),
  ('95000000-0000-0000-0000-000000000007','93000000-0000-0000-0000-000000000008','declined',770000000,'INR'),
  ('95000000-0000-0000-0000-000000000008','93000000-0000-0000-0000-000000000011','accepted',60000000,'INR'),
  ('95000000-0000-0000-0000-000000000009','93000000-0000-0000-0000-000000000012','revoked',660000000,'INR')
ON CONFLICT DO NOTHING;

INSERT INTO public.clearance_items (id,department_id,name,is_mandatory,is_active) VALUES
  ('94000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Library',true,true),
  ('94000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','Laboratory',true,true),
  ('94000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','Optional Survey',false,true),
  ('94000000-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111','Inactive Archive',true,false),
  ('94000000-0000-0000-0000-000000000005','22222222-2222-2222-2222-222222222222','Department Fees',true,true),
  ('94000000-0000-0000-0000-000000000006','22222222-2222-2222-2222-222222222222','Document Return',true,true),
  ('94000000-0000-0000-0000-000000000007','22222222-2222-2222-2222-222222222222','Optional Survey',false,true),
  ('94000000-0000-0000-0000-000000000008','33333333-3333-3333-3333-333333333333','Optional Exit Survey',false,true)
ON CONFLICT DO NOTHING;

INSERT INTO public.student_clearances (id,student_id,clearance_item_id,status,remarks,pending_requirements,approved_at,approved_by,updated_by,updated_at) VALUES
  ('99000000-0000-0000-0000-000000000101','90000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000001','cleared',NULL,ARRAY[]::text[],'2026-10-12T09:00:00.000Z',current_setting('campusos.demo_actor')::uuid,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000000102','90000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000002','not_applicable',NULL,ARRAY[]::text[],'2026-10-12T09:00:00.000Z',current_setting('campusos.demo_actor')::uuid,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000000103','90000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000003','rejected','Demonstration: return the recorded item',ARRAY['Return the demonstration item']::text[],NULL,NULL,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000000201','90000000-0000-0000-0000-000000000002','94000000-0000-0000-0000-000000000001','pending',NULL,ARRAY[]::text[],NULL,NULL,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000000202','90000000-0000-0000-0000-000000000002','94000000-0000-0000-0000-000000000002','cleared',NULL,ARRAY[]::text[],'2026-10-12T09:00:00.000Z',current_setting('campusos.demo_actor')::uuid,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000000203','90000000-0000-0000-0000-000000000002','94000000-0000-0000-0000-000000000003','pending',NULL,ARRAY[]::text[],NULL,NULL,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000000301','90000000-0000-0000-0000-000000000003','94000000-0000-0000-0000-000000000001','rejected','Demonstration: return the recorded item',ARRAY['Return the demonstration item']::text[],NULL,NULL,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000000302','90000000-0000-0000-0000-000000000003','94000000-0000-0000-0000-000000000002','cleared',NULL,ARRAY[]::text[],'2026-10-12T09:00:00.000Z',current_setting('campusos.demo_actor')::uuid,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000000303','90000000-0000-0000-0000-000000000003','94000000-0000-0000-0000-000000000003','pending',NULL,ARRAY[]::text[],NULL,NULL,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000000401','90000000-0000-0000-0000-000000000004','94000000-0000-0000-0000-000000000001','cleared',NULL,ARRAY[]::text[],'2026-10-12T09:00:00.000Z',current_setting('campusos.demo_actor')::uuid,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000000403','90000000-0000-0000-0000-000000000004','94000000-0000-0000-0000-000000000003','pending',NULL,ARRAY[]::text[],NULL,NULL,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000000503','90000000-0000-0000-0000-000000000005','94000000-0000-0000-0000-000000000003','pending',NULL,ARRAY[]::text[],NULL,NULL,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000000601','90000000-0000-0000-0000-000000000006','94000000-0000-0000-0000-000000000001','cleared',NULL,ARRAY[]::text[],'2026-10-12T09:00:00.000Z',current_setting('campusos.demo_actor')::uuid,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000000602','90000000-0000-0000-0000-000000000006','94000000-0000-0000-0000-000000000002','not_applicable',NULL,ARRAY[]::text[],'2026-10-12T09:00:00.000Z',current_setting('campusos.demo_actor')::uuid,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000000603','90000000-0000-0000-0000-000000000006','94000000-0000-0000-0000-000000000003','rejected','Demonstration: return the recorded item',ARRAY['Return the demonstration item']::text[],NULL,NULL,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000000701','90000000-0000-0000-0000-000000000007','94000000-0000-0000-0000-000000000001','pending',NULL,ARRAY[]::text[],NULL,NULL,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000000702','90000000-0000-0000-0000-000000000007','94000000-0000-0000-0000-000000000002','cleared',NULL,ARRAY[]::text[],'2026-10-12T09:00:00.000Z',current_setting('campusos.demo_actor')::uuid,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000000703','90000000-0000-0000-0000-000000000007','94000000-0000-0000-0000-000000000003','pending',NULL,ARRAY[]::text[],NULL,NULL,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000000801','90000000-0000-0000-0000-000000000008','94000000-0000-0000-0000-000000000001','rejected','Demonstration: return the recorded item',ARRAY['Return the demonstration item']::text[],NULL,NULL,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000000802','90000000-0000-0000-0000-000000000008','94000000-0000-0000-0000-000000000002','cleared',NULL,ARRAY[]::text[],'2026-10-12T09:00:00.000Z',current_setting('campusos.demo_actor')::uuid,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000000803','90000000-0000-0000-0000-000000000008','94000000-0000-0000-0000-000000000003','pending',NULL,ARRAY[]::text[],NULL,NULL,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000000901','90000000-0000-0000-0000-000000000009','94000000-0000-0000-0000-000000000001','cleared',NULL,ARRAY[]::text[],'2026-10-12T09:00:00.000Z',current_setting('campusos.demo_actor')::uuid,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000000903','90000000-0000-0000-0000-000000000009','94000000-0000-0000-0000-000000000003','pending',NULL,ARRAY[]::text[],NULL,NULL,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000001003','90000000-0000-0000-0000-000000000010','94000000-0000-0000-0000-000000000003','pending',NULL,ARRAY[]::text[],NULL,NULL,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000001105','90000000-0000-0000-0000-000000000011','94000000-0000-0000-0000-000000000005','cleared',NULL,ARRAY[]::text[],'2026-10-12T09:00:00.000Z',current_setting('campusos.demo_actor')::uuid,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000001106','90000000-0000-0000-0000-000000000011','94000000-0000-0000-0000-000000000006','not_applicable',NULL,ARRAY[]::text[],'2026-10-12T09:00:00.000Z',current_setting('campusos.demo_actor')::uuid,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000001107','90000000-0000-0000-0000-000000000011','94000000-0000-0000-0000-000000000007','rejected','Demonstration: return the recorded item',ARRAY['Return the demonstration item']::text[],NULL,NULL,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000001205','90000000-0000-0000-0000-000000000012','94000000-0000-0000-0000-000000000005','pending',NULL,ARRAY[]::text[],NULL,NULL,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000001206','90000000-0000-0000-0000-000000000012','94000000-0000-0000-0000-000000000006','cleared',NULL,ARRAY[]::text[],'2026-10-12T09:00:00.000Z',current_setting('campusos.demo_actor')::uuid,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000001207','90000000-0000-0000-0000-000000000012','94000000-0000-0000-0000-000000000007','pending',NULL,ARRAY[]::text[],NULL,NULL,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000001305','90000000-0000-0000-0000-000000000013','94000000-0000-0000-0000-000000000005','rejected','Demonstration: return the recorded item',ARRAY['Return the demonstration item']::text[],NULL,NULL,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000001306','90000000-0000-0000-0000-000000000013','94000000-0000-0000-0000-000000000006','cleared',NULL,ARRAY[]::text[],'2026-10-12T09:00:00.000Z',current_setting('campusos.demo_actor')::uuid,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000001307','90000000-0000-0000-0000-000000000013','94000000-0000-0000-0000-000000000007','pending',NULL,ARRAY[]::text[],NULL,NULL,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000001405','90000000-0000-0000-0000-000000000014','94000000-0000-0000-0000-000000000005','cleared',NULL,ARRAY[]::text[],'2026-10-12T09:00:00.000Z',current_setting('campusos.demo_actor')::uuid,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000001407','90000000-0000-0000-0000-000000000014','94000000-0000-0000-0000-000000000007','pending',NULL,ARRAY[]::text[],NULL,NULL,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000001507','90000000-0000-0000-0000-000000000015','94000000-0000-0000-0000-000000000007','pending',NULL,ARRAY[]::text[],NULL,NULL,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000001605','90000000-0000-0000-0000-000000000016','94000000-0000-0000-0000-000000000005','cleared',NULL,ARRAY[]::text[],'2026-10-12T09:00:00.000Z',current_setting('campusos.demo_actor')::uuid,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000001606','90000000-0000-0000-0000-000000000016','94000000-0000-0000-0000-000000000006','not_applicable',NULL,ARRAY[]::text[],'2026-10-12T09:00:00.000Z',current_setting('campusos.demo_actor')::uuid,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000001607','90000000-0000-0000-0000-000000000016','94000000-0000-0000-0000-000000000007','rejected','Demonstration: return the recorded item',ARRAY['Return the demonstration item']::text[],NULL,NULL,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000001705','90000000-0000-0000-0000-000000000017','94000000-0000-0000-0000-000000000005','pending',NULL,ARRAY[]::text[],NULL,NULL,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000001706','90000000-0000-0000-0000-000000000017','94000000-0000-0000-0000-000000000006','cleared',NULL,ARRAY[]::text[],'2026-10-12T09:00:00.000Z',current_setting('campusos.demo_actor')::uuid,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000001707','90000000-0000-0000-0000-000000000017','94000000-0000-0000-0000-000000000007','pending',NULL,ARRAY[]::text[],NULL,NULL,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000001805','90000000-0000-0000-0000-000000000018','94000000-0000-0000-0000-000000000005','rejected','Demonstration: return the recorded item',ARRAY['Return the demonstration item']::text[],NULL,NULL,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000001806','90000000-0000-0000-0000-000000000018','94000000-0000-0000-0000-000000000006','cleared',NULL,ARRAY[]::text[],'2026-10-12T09:00:00.000Z',current_setting('campusos.demo_actor')::uuid,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000001807','90000000-0000-0000-0000-000000000018','94000000-0000-0000-0000-000000000007','pending',NULL,ARRAY[]::text[],NULL,NULL,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000001905','90000000-0000-0000-0000-000000000019','94000000-0000-0000-0000-000000000005','cleared',NULL,ARRAY[]::text[],'2026-10-12T09:00:00.000Z',current_setting('campusos.demo_actor')::uuid,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000001907','90000000-0000-0000-0000-000000000019','94000000-0000-0000-0000-000000000007','pending',NULL,ARRAY[]::text[],NULL,NULL,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000002007','90000000-0000-0000-0000-000000000020','94000000-0000-0000-0000-000000000007','pending',NULL,ARRAY[]::text[],NULL,NULL,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000002108','90000000-0000-0000-0000-000000000021','94000000-0000-0000-0000-000000000008','rejected','Demonstration: return the recorded item',ARRAY['Return the demonstration item']::text[],NULL,NULL,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000002208','90000000-0000-0000-0000-000000000022','94000000-0000-0000-0000-000000000008','pending',NULL,ARRAY[]::text[],NULL,NULL,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000002308','90000000-0000-0000-0000-000000000023','94000000-0000-0000-0000-000000000008','pending',NULL,ARRAY[]::text[],NULL,NULL,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000002408','90000000-0000-0000-0000-000000000024','94000000-0000-0000-0000-000000000008','pending',NULL,ARRAY[]::text[],NULL,NULL,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000002508','90000000-0000-0000-0000-000000000025','94000000-0000-0000-0000-000000000008','pending',NULL,ARRAY[]::text[],NULL,NULL,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000002608','90000000-0000-0000-0000-000000000026','94000000-0000-0000-0000-000000000008','rejected','Demonstration: return the recorded item',ARRAY['Return the demonstration item']::text[],NULL,NULL,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000002708','90000000-0000-0000-0000-000000000027','94000000-0000-0000-0000-000000000008','pending',NULL,ARRAY[]::text[],NULL,NULL,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000002808','90000000-0000-0000-0000-000000000028','94000000-0000-0000-0000-000000000008','pending',NULL,ARRAY[]::text[],NULL,NULL,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000002908','90000000-0000-0000-0000-000000000029','94000000-0000-0000-0000-000000000008','pending',NULL,ARRAY[]::text[],NULL,NULL,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z'),
  ('99000000-0000-0000-0000-000000003008','90000000-0000-0000-0000-000000000030','94000000-0000-0000-0000-000000000008','pending',NULL,ARRAY[]::text[],NULL,NULL,current_setting('campusos.demo_actor')::uuid,'2026-10-12T09:00:00.000Z')
ON CONFLICT DO NOTHING;

DO $$ DECLARE item record; mode text; BEGIN
  FOR item IN SELECT * FROM campusos_demo_guard_state LOOP
    mode:=CASE item.tgenabled WHEN 'O' THEN 'ENABLE' WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' END;
    EXECUTE format('ALTER TABLE %s %s TRIGGER %I',item.tgrelid::regclass,mode,item.tgname);
  END LOOP;
END $$;
COMMIT;
