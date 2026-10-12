-- Seed data aligned with M3-1 fixtures
-- Note: profiles require auth.users; in a real Supabase environment these would be linked.
-- This seed is for local dev/testing with service role.

-- Departments
INSERT INTO departments (id, code, name) VALUES
  ('11111111-1111-1111-1111-111111111111', 'CSE', 'Computer Science'),
  ('22222222-2222-2222-2222-222222222222', 'ECE', 'Electronics'),
  ('33333333-3333-3333-3333-333333333333', 'ME', 'Mechanical')
ON CONFLICT DO NOTHING;

-- Incharge profile (dummy auth user id for seed)
INSERT INTO profiles (id, role) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'placement_incharge')
ON CONFLICT DO NOTHING;

-- Students
INSERT INTO students (id, student_number, full_name, email, department_id, graduation_year, cgpa, phone) VALUES
  ('00000000-0000-0000-0000-000000000001', '001', 'Demo Student One', 'one@example.test', '11111111-1111-1111-1111-111111111111', 2027, 8.2, NULL),
  ('00000000-0000-0000-0000-000000000002', '002', 'Demo Student Two', 'two@example.test', '11111111-1111-1111-1111-111111111111', 2027, NULL, NULL),
  ('00000000-0000-0000-0000-000000000003', '003', 'Demo Student Three', 'three@example.test', '11111111-1111-1111-1111-111111111111', 2027, 7.0, NULL),
  ('00000000-0000-0000-0000-000000000004', '004', 'Demo Student Four', 'four@example.test', '22222222-2222-2222-2222-222222222222', 2027, 9.0, NULL),
  ('00000000-0000-0000-0000-000000000005', '005', 'Demo Student Five', 'five@example.test', '33333333-3333-3333-3333-333333333333', 2027, NULL, NULL)
ON CONFLICT DO NOTHING;

-- Companies
INSERT INTO companies (id, name) VALUES
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Demo Systems'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Demo Labs')
ON CONFLICT DO NOTHING;

-- Drives
INSERT INTO drives (id, company_id, title, start_date, status) VALUES
  ('e0000000-e000-e000-e000-e00000000001', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'Graduate Engineer', '2026-10-01', 'published'),
  ('e0000000-e000-e000-e000-e00000000002', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'Associate Engineer', '2026-10-12', 'completed'),
  ('e0000000-e000-e000-e000-e00000000003', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'Cancelled Drive', '2026-10-10', 'cancelled'),
  ('e0000000-e000-e000-e000-e00000000004', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'Draft Drive', '2026-10-11', 'draft')
ON CONFLICT DO NOTHING;

-- Applications
INSERT INTO applications (id, student_id, drive_id, status) VALUES
  ('a1000000-a100-a100-a100-a10000000001', '00000000-0000-0000-0000-000000000001', 'e0000000-e000-e000-e000-e00000000001', 'selected'),
  ('a1000000-a100-a100-a100-a10000000002', '00000000-0000-0000-0000-000000000001', 'e0000000-e000-e000-e000-e00000000002', 'selected'),
  ('a1000000-a100-a100-a100-a10000000003', '00000000-0000-0000-0000-000000000002', 'e0000000-e000-e000-e000-e00000000003', 'selected'),
  ('a1000000-a100-a100-a100-a10000000004', '00000000-0000-0000-0000-000000000002', 'e0000000-e000-e000-e000-e00000000001', 'withdrawn'),
  ('a1000000-a100-a100-a100-a10000000005', '00000000-0000-0000-0000-000000000003', 'e0000000-e000-e000-e000-e00000000001', 'selected'),
  ('a1000000-a100-a100-a100-a10000000006', '00000000-0000-0000-0000-000000000004', 'e0000000-e000-e000-e000-e00000000002', 'selected'),
  ('a1000000-a100-a100-a100-a10000000007', '00000000-0000-0000-0000-000000000003', 'e0000000-e000-e000-e000-e00000000002', 'in_progress'),
  ('a1000000-a100-a100-a100-a10000000008', '00000000-0000-0000-0000-000000000005', 'e0000000-e000-e000-e000-e00000000004', 'selected')
ON CONFLICT DO NOTHING;

-- Offers
INSERT INTO offers (id, application_id, status, annual_ctc_minor, currency) VALUES
  ('o1000000-o100-o100-o100-o10000000001', 'a1000000-a100-a100-a100-a10000000001', 'offered', 10000000, 'INR'),
  ('o1000000-o100-o100-o100-o10000000002', 'a1000000-a100-a100-a100-a10000000002', 'accepted', 20000000, 'INR'),
  ('o1000000-o100-o100-o100-o10000000003', 'a1000000-a100-a100-a100-a10000000003', 'accepted', 99000000, 'INR'),
  ('o1000000-o100-o100-o100-o10000000004', 'a1000000-a100-a100-a100-a10000000004', 'accepted', 88000000, 'INR'),
  ('o1000000-o100-o100-o100-o10000000005', 'a1000000-a100-a100-a100-a10000000005', 'declined', 77000000, 'INR'),
  ('o1000000-o100-o100-o100-o10000000006', 'a1000000-a100-a100-a100-a10000000006', 'accepted', NULL, 'INR'),
  ('o1000000-o100-o100-o100-o10000000007', 'a1000000-a100-a100-a100-a10000000005', 'revoked', 66000000, 'INR'),
  ('o1000000-o100-o100-o100-o10000000008', 'a1000000-a100-a100-a100-a10000000008', 'accepted', 55000000, 'INR')
ON CONFLICT DO NOTHING;

-- Clearance items
INSERT INTO clearance_items (id, department_id, name, is_mandatory, is_active) VALUES
  ('i1000000-i100-i100-i100-i10000000001', '11111111-1111-1111-1111-111111111111', 'Library', TRUE, TRUE),
  ('i1000000-i100-i100-i100-i10000000002', '11111111-1111-1111-1111-111111111111', 'Lab', TRUE, TRUE),
  ('i1000000-i100-i100-i100-i10000000003', '22222222-2222-2222-2222-222222222222', 'Library', TRUE, TRUE),
  ('i1000000-i100-i100-i100-i10000000004', '11111111-1111-1111-1111-111111111111', 'Optional Survey', FALSE, TRUE),
  ('i1000000-i100-i100-i100-i10000000005', '11111111-1111-1111-1111-111111111111', 'Old Checklist', TRUE, FALSE)
ON CONFLICT DO NOTHING;

-- Student clearances
INSERT INTO student_clearances (id, student_id, clearance_item_id, status, approved_by, approved_at) VALUES
  ('cl000000-cl000-cl000-cl000-cl000000001', '00000000-0000-0000-0000-000000000001', 'i1000000-i100-i100-i100-i10000000001', 'cleared', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-10-12T09:00:00Z'),
  ('cl000000-cl000-cl000-cl000-cl000000002', '00000000-0000-0000-0000-000000000001', 'i1000000-i100-i100-i100-i10000000002', 'not_applicable', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-10-12T09:00:00Z'),
  ('cl000000-cl000-cl000-cl000-cl000000003', '00000000-0000-0000-0000-000000000002', 'i1000000-i100-i100-i100-i10000000001', 'pending', NULL, NULL),
  ('cl000000-cl000-cl000-cl000-cl000000004', '00000000-0000-0000-0000-000000000004', 'i1000000-i100-i100-i100-i10000000003', 'cleared', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-10-12T09:00:00Z'),
  ('cl000000-cl000-cl000-cl000-cl000000005', '00000000-0000-0000-0000-000000000001', 'i1000000-i100-i100-i100-i10000000004', 'pending', NULL, NULL),
  ('cl000000-cl000-cl000-cl000-cl000000006', '00000000-0000-0000-0000-000000000001', 'i1000000-i100-i100-i100-i10000000005', 'pending', NULL, NULL)
ON CONFLICT DO NOTHING;
