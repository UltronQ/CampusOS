-- M1-3 schema request (authored by Member 1, for Member 2 review).
-- Adds PDF-required drive metadata and eligibility targeting plus the two
-- PDF lifecycle values the UI needs. Non-destructive; safe to re-run.
-- Owner of schema remains Member 2 — review before applying to shared projects.

-- PDF drive status "In Progress" and application outcome "Joined"
ALTER TYPE drive_status ADD VALUE IF NOT EXISTS 'in_progress';
ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'joined';

-- Drive metadata required by the problem statement PDF
ALTER TABLE drives ADD COLUMN IF NOT EXISTS criteria TEXT;
ALTER TABLE drives ADD COLUMN IF NOT EXISTS application_deadline DATE;
ALTER TABLE drives ADD COLUMN IF NOT EXISTS job_location TEXT;
ALTER TABLE drives ADD COLUMN IF NOT EXISTS annual_ctc_minor INTEGER
  CHECK (annual_ctc_minor IS NULL OR annual_ctc_minor >= 0);
ALTER TABLE drives ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'INR';

-- Eligible departments / batches per drive (null graduation_year = all batches)
CREATE TABLE IF NOT EXISTS drive_eligibility (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  drive_id UUID NOT NULL REFERENCES drives(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  graduation_year INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT drive_eligibility_unique UNIQUE (drive_id, department_id, graduation_year)
);

CREATE INDEX IF NOT EXISTS idx_drive_eligibility_drive ON drive_eligibility(drive_id);
CREATE INDEX IF NOT EXISTS idx_drive_eligibility_department ON drive_eligibility(department_id);

ALTER TABLE drive_eligibility ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read drive eligibility" ON drive_eligibility
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "In-charge can manage drive eligibility" ON drive_eligibility
  FOR ALL USING (is_placement_incharge()) WITH CHECK (is_placement_incharge());
