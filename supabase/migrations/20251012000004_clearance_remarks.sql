-- Clearance remarks (Member 1, M1-4) — additive, for Member 2 review.
-- Adds an in-charge-maintained remark per student-item decision so pending
-- requirements can carry guidance for the student. Follows the phase-one
-- authorization pattern (authenticated read, in-charge manage).

BEGIN;

ALTER TABLE public.student_clearances
  ADD COLUMN IF NOT EXISTS remarks TEXT;

COMMIT;
