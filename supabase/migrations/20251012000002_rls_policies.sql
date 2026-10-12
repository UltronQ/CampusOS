-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE drives ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE recruitment_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_stage_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE clearance_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_clearances ENABLE ROW LEVEL SECURITY;

-- Helper functions
CREATE OR REPLACE FUNCTION is_placement_incharge(uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM profiles p WHERE p.id = uid AND p.role = 'placement_incharge');
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION get_student_id(uid UUID DEFAULT auth.uid())
RETURNS UUID AS $$
  SELECT s.id FROM students s WHERE s.user_id = uid LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Profiles policies
CREATE POLICY "Users can read own profile" ON profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "In-charge can read all profiles" ON profiles
  FOR SELECT USING (is_placement_incharge());

CREATE POLICY "In-charge can manage profiles" ON profiles
  FOR ALL USING (is_placement_incharge()) WITH CHECK (is_placement_incharge());

-- Departments: readable by authenticated; manageable by in-charge
CREATE POLICY "Authenticated users can read departments" ON departments
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "In-charge can manage departments" ON departments
  FOR ALL USING (is_placement_incharge()) WITH CHECK (is_placement_incharge());

-- Students
CREATE POLICY "In-charge can manage students" ON students
  FOR ALL USING (is_placement_incharge()) WITH CHECK (is_placement_incharge());

CREATE POLICY "Students can read own record" ON students
  FOR SELECT USING (user_id = auth.uid());

-- Companies
CREATE POLICY "Authenticated users can read companies" ON companies
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "In-charge can manage companies" ON companies
  FOR ALL USING (is_placement_incharge()) WITH CHECK (is_placement_incharge());

-- Drives: in-charge full; students can read all drives to see published ones? Or filter by status in app. But RLS is basic; app enforces.
CREATE POLICY "Authenticated users can read drives" ON drives
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "In-charge can manage drives" ON drives
  FOR ALL USING (is_placement_incharge()) WITH CHECK (is_placement_incharge());

-- Applications
CREATE POLICY "In-charge can manage applications" ON applications
  FOR ALL USING (is_placement_incharge()) WITH CHECK (is_placement_incharge());

CREATE POLICY "Students can read own applications" ON applications
  FOR SELECT USING (student_id = get_student_id());

CREATE POLICY "Students can create own applications" ON applications
  FOR INSERT WITH CHECK (student_id = get_student_id());

CREATE POLICY "Students can update own applications (limited)" ON applications
  FOR UPDATE USING (student_id = get_student_id()) WITH CHECK (student_id = get_student_id());

-- Recruitment stages
CREATE POLICY "Authenticated users can read stages" ON recruitment_stages
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "In-charge can manage stages" ON recruitment_stages
  FOR ALL USING (is_placement_incharge()) WITH CHECK (is_placement_incharge());

-- Application stage results: students see only published for their own apps; in-charge manages
CREATE POLICY "In-charge can manage stage results" ON application_stage_results
  FOR ALL USING (is_placement_incharge()) WITH CHECK (is_placement_incharge());

CREATE POLICY "Students can read published results for own applications" ON application_stage_results
  FOR SELECT USING (
    published_at IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM applications a
      WHERE a.id = application_stage_results.application_id
        AND a.student_id = get_student_id()
    )
  );

-- Offers
CREATE POLICY "In-charge can manage offers" ON offers
  FOR ALL USING (is_placement_incharge()) WITH CHECK (is_placement_incharge());

CREATE POLICY "Students can read own offers" ON offers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM applications a
      WHERE a.id = offers.application_id
        AND a.student_id = get_student_id()
    )
  );

-- Clearance items
CREATE POLICY "Authenticated users can read clearance items" ON clearance_items
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "In-charge can manage clearance items" ON clearance_items
  FOR ALL USING (is_placement_incharge()) WITH CHECK (is_placement_incharge());

-- Student clearances
CREATE POLICY "In-charge can manage student clearances" ON student_clearances
  FOR ALL USING (is_placement_incharge()) WITH CHECK (is_placement_incharge());

CREATE POLICY "Students can read own clearances" ON student_clearances
  FOR SELECT USING (student_id = get_student_id());
