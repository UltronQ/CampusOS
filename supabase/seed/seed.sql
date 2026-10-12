-- Synthetic development data. Run as a trusted database owner after migrations.
-- Never creates auth users or assigns roles. Existing in-charge profiles supply
-- approval evidence; without one, terminal demo decisions remain pending.
BEGIN;

-- Historical fixtures deliberately include withdrawn/cancelled placements.
-- Only the trusted table owner can suspend these lifecycle triggers; the
-- transaction restores them before commit, without weakening runtime policies.
DO $$
DECLARE item record;
BEGIN
  FOR item IN SELECT tgrelid::regclass AS relation, tgname FROM pg_trigger
    WHERE NOT tgisinternal AND tgrelid IN ('public.drives'::regclass,
      'public.applications'::regclass, 'public.offers'::regclass,
      'public.clearance_items'::regclass, 'public.student_clearances'::regclass)
      AND tgname IN ('guard_drive', 'guard_application', 'guard_offer', 'guard_clearance_item', 'guard_student_clearance') LOOP
    EXECUTE format('ALTER TABLE %s DISABLE TRIGGER %I', item.relation, item.tgname);
  END LOOP;
END;
$$;

-- Departments
INSERT INTO departments (id, code, name) VALUES
  ('11111111-1111-1111-1111-111111111111', 'CSE', 'Computer Science'),
  ('22222222-2222-2222-2222-222222222222', 'ECE', 'Electronics'),
  ('33333333-3333-3333-3333-333333333333', 'ME', 'Mechanical')
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
  ('f1000000-f100-f100-f100-f10000000001', 'a1000000-a100-a100-a100-a10000000001', 'offered', 10000000, 'INR'),
  ('f1000000-f100-f100-f100-f10000000002', 'a1000000-a100-a100-a100-a10000000002', 'accepted', 20000000, 'INR'),
  ('f1000000-f100-f100-f100-f10000000003', 'a1000000-a100-a100-a100-a10000000003', 'accepted', 99000000, 'INR'),
  ('f1000000-f100-f100-f100-f10000000004', 'a1000000-a100-a100-a100-a10000000004', 'accepted', 88000000, 'INR'),
  ('f1000000-f100-f100-f100-f10000000005', 'a1000000-a100-a100-a100-a10000000005', 'declined', 77000000, 'INR'),
  ('f1000000-f100-f100-f100-f10000000006', 'a1000000-a100-a100-a100-a10000000006', 'accepted', NULL, 'INR'),
  ('f1000000-f100-f100-f100-f10000000007', 'a1000000-a100-a100-a100-a10000000005', 'revoked', 66000000, 'INR'),
  ('f1000000-f100-f100-f100-f10000000008', 'a1000000-a100-a100-a100-a10000000008', 'accepted', 55000000, 'INR')
ON CONFLICT DO NOTHING;

-- Clearance items
INSERT INTO clearance_items (id, department_id, name, is_mandatory, is_active) VALUES
  ('b1000000-b100-b100-b100-b10000000001', '11111111-1111-1111-1111-111111111111', 'Library', TRUE, TRUE),
  ('b1000000-b100-b100-b100-b10000000002', '11111111-1111-1111-1111-111111111111', 'Lab', TRUE, TRUE),
  ('b1000000-b100-b100-b100-b10000000003', '22222222-2222-2222-2222-222222222222', 'Library', TRUE, TRUE),
  ('b1000000-b100-b100-b100-b10000000004', '11111111-1111-1111-1111-111111111111', 'Optional Survey', FALSE, TRUE),
  ('b1000000-b100-b100-b100-b10000000005', '11111111-1111-1111-1111-111111111111', 'Old Checklist', TRUE, FALSE)
ON CONFLICT DO NOTHING;

-- Student clearances: terminal approvals require a real existing in-charge.
WITH approver AS (
  SELECT id FROM public.profiles WHERE role = 'placement_incharge' ORDER BY id LIMIT 1
), decisions (id, student_id, clearance_item_id, status, approved_at) AS (
  VALUES
  ('c1000000-c100-c100-c100-c10000000001', '00000000-0000-0000-0000-000000000001', 'b1000000-b100-b100-b100-b10000000001', 'cleared', '2026-10-12T09:00:00Z'),
  ('c1000000-c100-c100-c100-c10000000002', '00000000-0000-0000-0000-000000000001', 'b1000000-b100-b100-b100-b10000000002', 'not_applicable', '2026-10-12T09:00:00Z'),
  ('c1000000-c100-c100-c100-c10000000003', '00000000-0000-0000-0000-000000000002', 'b1000000-b100-b100-b100-b10000000001', 'pending', NULL),
  ('c1000000-c100-c100-c100-c10000000004', '00000000-0000-0000-0000-000000000004', 'b1000000-b100-b100-b100-b10000000003', 'cleared', '2026-10-12T09:00:00Z'),
  ('c1000000-c100-c100-c100-c10000000005', '00000000-0000-0000-0000-000000000001', 'b1000000-b100-b100-b100-b10000000004', 'pending', NULL),
  ('c1000000-c100-c100-c100-c10000000006', '00000000-0000-0000-0000-000000000001', 'b1000000-b100-b100-b100-b10000000005', 'pending', NULL)
)
INSERT INTO public.student_clearances
  (id, student_id, clearance_item_id, status, approved_by, approved_at)
SELECT d.id::uuid, d.student_id::uuid, d.clearance_item_id::uuid,
  CASE WHEN a.id IS NULL THEN 'pending' ELSE d.status END::public.clearance_status,
  CASE WHEN d.status IN ('cleared', 'not_applicable') THEN a.id END,
  CASE WHEN a.id IS NOT NULL AND d.status IN ('cleared', 'not_applicable')
    THEN d.approved_at::timestamptz END
FROM decisions d LEFT JOIN approver a ON true
ON CONFLICT DO NOTHING;

DO $$
DECLARE item record;
BEGIN
  FOR item IN SELECT tgrelid::regclass AS relation, tgname FROM pg_trigger
    WHERE NOT tgisinternal AND tgrelid IN ('public.drives'::regclass,
      'public.applications'::regclass, 'public.offers'::regclass,
      'public.clearance_items'::regclass, 'public.student_clearances'::regclass)
      AND tgname IN ('guard_drive', 'guard_application', 'guard_offer', 'guard_clearance_item', 'guard_student_clearance') LOOP
    EXECUTE format('ALTER TABLE %s ENABLE TRIGGER %I', item.relation, item.tgname);
  END LOOP;
END;
$$;

COMMIT;
