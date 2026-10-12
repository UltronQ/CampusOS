-- CampusOS Initial Schema (Member 2)
-- Matches M3-1 contracts. Enums and tables with RLS to be added.

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS citext;

-- Enums
CREATE TYPE user_role AS ENUM ('placement_incharge', 'student');
CREATE TYPE application_status AS ENUM ('applied', 'in_progress', 'selected', 'rejected', 'withdrawn');
CREATE TYPE drive_status AS ENUM ('draft', 'published', 'completed', 'cancelled');
CREATE TYPE offer_status AS ENUM ('offered', 'accepted', 'declined', 'revoked');
CREATE TYPE clearance_status AS ENUM ('pending', 'cleared', 'not_applicable');
CREATE TYPE stage_result_status AS ENUM ('pending', 'passed', 'failed');

-- Departments
CREATE TABLE departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);

-- Profiles linked to auth.users
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Students
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  student_number TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  email CITEXT NOT NULL UNIQUE,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  graduation_year INTEGER NOT NULL CHECK (graduation_year > 1900 AND graduation_year < 2100),
  cgpa NUMERIC(3,2) CHECK (cgpa >= 0 AND cgpa <= 10),
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Companies
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Drives
CREATE TABLE drives (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  start_date DATE NOT NULL,
  status drive_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Applications (one per student per drive)
CREATE TABLE applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  drive_id UUID NOT NULL REFERENCES drives(id) ON DELETE CASCADE,
  status application_status NOT NULL DEFAULT 'applied',
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT applications_student_drive_unique UNIQUE (student_id, drive_id)
);

-- Recruitment stages per drive
CREATE TABLE recruitment_stages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  drive_id UUID NOT NULL REFERENCES drives(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT recruitment_stages_drive_sequence_unique UNIQUE (drive_id, sequence),
  CONSTRAINT recruitment_stages_drive_name_unique UNIQUE (drive_id, name)
);

-- Application stage results
CREATE TABLE application_stage_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES recruitment_stages(id) ON DELETE CASCADE,
  status stage_result_status NOT NULL DEFAULT 'pending',
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT asr_application_stage_unique UNIQUE (application_id, stage_id)
);

-- Offers
CREATE TABLE offers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  status offer_status NOT NULL DEFAULT 'offered',
  annual_ctc_minor INTEGER CHECK (annual_ctc_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Clearance items
CREATE TABLE clearance_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_mandatory BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT clearance_items_dept_name_unique UNIQUE (department_id, name)
);

-- Student clearances
CREATE TABLE student_clearances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  clearance_item_id UUID NOT NULL REFERENCES clearance_items(id) ON DELETE CASCADE,
  status clearance_status NOT NULL DEFAULT 'pending',
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT student_clearances_unique UNIQUE (student_id, clearance_item_id),
  CONSTRAINT student_clearances_approval_consistency CHECK (
    (status IN ('cleared','not_applicable') AND approved_by IS NOT NULL AND approved_at IS NOT NULL) OR
    (status = 'pending')
  )
);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_students_updated_at BEFORE UPDATE ON students FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_drives_updated_at BEFORE UPDATE ON drives FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_applications_updated_at BEFORE UPDATE ON applications FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_application_stage_results_updated_at BEFORE UPDATE ON application_stage_results FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_offers_updated_at BEFORE UPDATE ON offers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_clearance_items_updated_at BEFORE UPDATE ON clearance_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_student_clearances_updated_at BEFORE UPDATE ON student_clearances FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Indexes for performance
CREATE INDEX idx_students_department ON students(department_id);
CREATE INDEX idx_students_student_number ON students(student_number);
CREATE INDEX idx_students_email ON students(email);
CREATE INDEX idx_drives_company ON drives(company_id);
CREATE INDEX idx_drives_start_date ON drives(start_date);
CREATE INDEX idx_applications_student ON applications(student_id);
CREATE INDEX idx_applications_drive ON applications(drive_id);
CREATE INDEX idx_recruitment_stages_drive ON recruitment_stages(drive_id);
CREATE INDEX idx_asr_application ON application_stage_results(application_id);
CREATE INDEX idx_asr_stage ON application_stage_results(stage_id);
CREATE INDEX idx_offers_application ON offers(application_id);
CREATE INDEX idx_clearance_items_dept ON clearance_items(department_id);
CREATE INDEX idx_student_clearances_student ON student_clearances(student_id);
CREATE INDEX idx_student_clearances_item ON student_clearances(clearance_item_id);
