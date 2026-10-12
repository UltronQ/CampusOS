-- Test-only M2-5 audit fixture. Default application/demo seeding uses seed.sql.
-- Fresh disposable development database only. Provision these three Auth users
-- first: aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa (in-charge), and
-- bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1 / bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2 (students).
-- Run as the database owner for profile bootstrap, then exercise authenticated RLS.
-- File is atomic and intentionally fails on re-run instead of ignoring conflicts.
BEGIN;
DO $$ BEGIN
  IF (SELECT count(*) FROM auth.users WHERE id IN ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2')) <> 3 THEN
    RAISE EXCEPTION 'Provision the three documented development Auth identities before seeding';
  END IF;
END $$;

-- Departments
INSERT INTO departments (id, code, name) VALUES
  ('11111111-1111-1111-1111-111111111111', 'CSE', 'Computer Science'),
  ('22222222-2222-2222-2222-222222222222', 'ECE', 'Electronics'),
  ('33333333-3333-3333-3333-333333333333', 'ME', 'Mechanical');

-- Incharge profile (dummy auth user id for seed)
INSERT INTO profiles (id, role) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'placement_incharge'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'student'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'student');

SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;

-- Students
INSERT INTO students (id, student_number, full_name, email, department_id, graduation_year, cgpa, phone) VALUES
  ('00000000-0000-0000-0000-000000000001', '001', 'Demo Student One', 'one@example.test', '11111111-1111-1111-1111-111111111111', 2027, 8.2, NULL),
  ('00000000-0000-0000-0000-000000000002', '002', 'Demo Student Two', 'two@example.test', '11111111-1111-1111-1111-111111111111', 2027, NULL, NULL),
  ('00000000-0000-0000-0000-000000000003', '003', 'Demo Student Three', 'three@example.test', '11111111-1111-1111-1111-111111111111', 2027, 7.0, NULL),
  ('00000000-0000-0000-0000-000000000004', '004', 'Demo Student Four', 'four@example.test', '22222222-2222-2222-2222-222222222222', 2027, 9.0, NULL),
  ('00000000-0000-0000-0000-000000000005', '005', 'Demo Student Five', 'five@example.test', '33333333-3333-3333-3333-333333333333', 2027, NULL, NULL);

UPDATE students SET user_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1' WHERE student_number='001';
UPDATE students SET user_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2' WHERE student_number='002';

-- Companies
INSERT INTO companies (id, name) VALUES
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Demo Systems'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Demo Labs');

-- Drives
INSERT INTO drives (id, company_id, title, start_date, status) VALUES
  ('e0000000-e000-e000-e000-e00000000001', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'Graduate Engineer', '2026-10-01', 'draft'),
  ('e0000000-e000-e000-e000-e00000000002', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'Associate Engineer', '2026-10-12', 'draft'),
  ('e0000000-e000-e000-e000-e00000000003', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'Cancelled Drive', '2026-10-10', 'draft'),
  ('e0000000-e000-e000-e000-e00000000004', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'Draft Drive', '2026-10-11', 'draft');

UPDATE drives SET status='published' WHERE id IN ('e0000000-e000-e000-e000-e00000000001',
  'e0000000-e000-e000-e000-e00000000002','e0000000-e000-e000-e000-e00000000003');

-- Applications
INSERT INTO applications (id, student_id, drive_id, status) VALUES
  ('a1000000-a100-a100-a100-a10000000001', '00000000-0000-0000-0000-000000000001', 'e0000000-e000-e000-e000-e00000000001', 'applied'),
  ('a1000000-a100-a100-a100-a10000000002', '00000000-0000-0000-0000-000000000001', 'e0000000-e000-e000-e000-e00000000002', 'applied'),
  ('a1000000-a100-a100-a100-a10000000003', '00000000-0000-0000-0000-000000000002', 'e0000000-e000-e000-e000-e00000000003', 'applied'),
  ('a1000000-a100-a100-a100-a10000000004', '00000000-0000-0000-0000-000000000002', 'e0000000-e000-e000-e000-e00000000001', 'applied'),
  ('a1000000-a100-a100-a100-a10000000005', '00000000-0000-0000-0000-000000000003', 'e0000000-e000-e000-e000-e00000000001', 'applied'),
  ('a1000000-a100-a100-a100-a10000000006', '00000000-0000-0000-0000-000000000004', 'e0000000-e000-e000-e000-e00000000002', 'applied'),
  ('a1000000-a100-a100-a100-a10000000007', '00000000-0000-0000-0000-000000000003', 'e0000000-e000-e000-e000-e00000000002', 'applied');

UPDATE applications SET status='selected' WHERE id IN ('a1000000-a100-a100-a100-a10000000001',
  'a1000000-a100-a100-a100-a10000000002','a1000000-a100-a100-a100-a10000000003',
  'a1000000-a100-a100-a100-a10000000004','a1000000-a100-a100-a100-a10000000005',
  'a1000000-a100-a100-a100-a10000000006');
UPDATE applications SET status='in_progress' WHERE id='a1000000-a100-a100-a100-a10000000007';

-- Offers
INSERT INTO offers (id, application_id, status, annual_ctc_minor, currency) VALUES
  ('b1000000-b100-b100-b100-b10000000001', 'a1000000-a100-a100-a100-a10000000001', 'offered', 10000000, 'INR'),
  ('b1000000-b100-b100-b100-b10000000002', 'a1000000-a100-a100-a100-a10000000002', 'offered', 20000000, 'INR'),
  ('b1000000-b100-b100-b100-b10000000003', 'a1000000-a100-a100-a100-a10000000003', 'offered', 99000000, 'INR'),
  ('b1000000-b100-b100-b100-b10000000004', 'a1000000-a100-a100-a100-a10000000004', 'offered', 88000000, 'INR'),
  ('b1000000-b100-b100-b100-b10000000005', 'a1000000-a100-a100-a100-a10000000005', 'offered', 77000000, 'INR'),
  ('b1000000-b100-b100-b100-b10000000006', 'a1000000-a100-a100-a100-a10000000006', 'offered', NULL, 'INR'),
  ('b1000000-b100-b100-b100-b10000000007', 'a1000000-a100-a100-a100-a10000000005', 'offered', 66000000, 'INR');

UPDATE offers SET status='accepted' WHERE id IN ('b1000000-b100-b100-b100-b10000000002',
  'b1000000-b100-b100-b100-b10000000003','b1000000-b100-b100-b100-b10000000004','b1000000-b100-b100-b100-b10000000006');
UPDATE offers SET status='declined' WHERE id='b1000000-b100-b100-b100-b10000000005';
UPDATE offers SET status='revoked' WHERE id='b1000000-b100-b100-b100-b10000000007';
UPDATE applications SET status='withdrawn' WHERE id='a1000000-a100-a100-a100-a10000000004';
UPDATE drives SET status='completed' WHERE id='e0000000-e000-e000-e000-e00000000002';
UPDATE drives SET status='cancelled' WHERE id='e0000000-e000-e000-e000-e00000000003';

INSERT INTO recruitment_stages(id,drive_id,name,sequence) VALUES
 ('91000000-0000-0000-0000-000000000001','e0000000-e000-e000-e000-e00000000001','Interview',1),
 ('91000000-0000-0000-0000-000000000002','e0000000-e000-e000-e000-e00000000002','Assessment',1),
 ('91000000-0000-0000-0000-000000000003','e0000000-e000-e000-e000-e00000000004','Unpublished Stage',1);
INSERT INTO application_stage_results(id,application_id,stage_id,status,published_at) VALUES
 ('92000000-0000-0000-0000-000000000001','a1000000-a100-a100-a100-a10000000001','91000000-0000-0000-0000-000000000001','passed',now()),
 ('92000000-0000-0000-0000-000000000002','a1000000-a100-a100-a100-a10000000002','91000000-0000-0000-0000-000000000002','failed',NULL),
 ('92000000-0000-0000-0000-000000000003','a1000000-a100-a100-a100-a10000000006','91000000-0000-0000-0000-000000000002','passed',now());

-- Clearance items
INSERT INTO clearance_items (id, department_id, name, is_mandatory, is_active) VALUES
  ('f1000000-f100-f100-f100-f10000000001', '11111111-1111-1111-1111-111111111111', 'Library', TRUE, TRUE),
  ('f1000000-f100-f100-f100-f10000000002', '11111111-1111-1111-1111-111111111111', 'Lab', TRUE, TRUE),
  ('f1000000-f100-f100-f100-f10000000003', '22222222-2222-2222-2222-222222222222', 'Library', TRUE, TRUE),
  ('f1000000-f100-f100-f100-f10000000004', '11111111-1111-1111-1111-111111111111', 'Optional Survey', FALSE, TRUE),
  ('f1000000-f100-f100-f100-f10000000005', '11111111-1111-1111-1111-111111111111', 'Old Checklist', TRUE, FALSE);
-- Student clearances
INSERT INTO student_clearances (id, student_id, clearance_item_id, status, approved_by, approved_at) VALUES
  ('c1000000-c100-c100-c100-c10000000001', '00000000-0000-0000-0000-000000000001', 'f1000000-f100-f100-f100-f10000000001', 'cleared', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-10-12T09:00:00Z'),
  ('c1000000-c100-c100-c100-c10000000002', '00000000-0000-0000-0000-000000000001', 'f1000000-f100-f100-f100-f10000000002', 'not_applicable', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-10-12T09:00:00Z'),
  ('c1000000-c100-c100-c100-c10000000003', '00000000-0000-0000-0000-000000000002', 'f1000000-f100-f100-f100-f10000000001', 'pending', NULL, NULL),
  ('c1000000-c100-c100-c100-c10000000004', '00000000-0000-0000-0000-000000000004', 'f1000000-f100-f100-f100-f10000000003', 'cleared', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-10-12T09:00:00Z'),
  ('c1000000-c100-c100-c100-c10000000005', '00000000-0000-0000-0000-000000000001', 'f1000000-f100-f100-f100-f10000000004', 'pending', NULL, NULL),
  ('c1000000-c100-c100-c100-c10000000006', '00000000-0000-0000-0000-000000000001', 'f1000000-f100-f100-f100-f10000000005', 'pending', NULL, NULL);
COMMIT;
