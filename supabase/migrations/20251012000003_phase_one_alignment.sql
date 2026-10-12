-- Additive correction: apply after the two existing migrations.
BEGIN;

ALTER TABLE public.students
  ALTER COLUMN cgpa TYPE NUMERIC(4,2),
  ADD COLUMN backlogs INTEGER CHECK (backlogs >= 0);

ALTER TABLE public.drives
  ADD COLUMN eligible_graduation_years INTEGER[] NOT NULL DEFAULT '{}',
  ADD COLUMN min_cgpa NUMERIC(4,2) CHECK (min_cgpa >= 0 AND min_cgpa <= 10),
  ADD COLUMN max_backlogs INTEGER CHECK (max_backlogs >= 0),
  ADD COLUMN application_deadline TIMESTAMPTZ,
  ADD CONSTRAINT drives_eligible_years_valid CHECK (
    array_position(eligible_graduation_years, NULL) IS NULL
    AND 1900 < ALL(eligible_graduation_years)
    AND 2100 > ALL(eligible_graduation_years)
  );

-- No rows means every department. Join rows enforce real department references.
CREATE TABLE public.drive_departments (
  drive_id UUID NOT NULL REFERENCES public.drives(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE RESTRICT,
  PRIMARY KEY (drive_id, department_id)
);
CREATE INDEX idx_drive_departments_department ON public.drive_departments(department_id);
ALTER TABLE public.drive_departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read drive departments" ON public.drive_departments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "In-charge can manage drive departments" ON public.drive_departments
  FOR ALL TO authenticated USING (public.is_placement_incharge())
  WITH CHECK (public.is_placement_incharge());

-- An application (and hence its offers) prevents parent student/drive deletion.
ALTER TABLE public.applications
  DROP CONSTRAINT applications_student_id_fkey,
  ADD CONSTRAINT applications_student_id_fkey FOREIGN KEY (student_id)
    REFERENCES public.students(id) ON DELETE RESTRICT,
  DROP CONSTRAINT applications_drive_id_fkey,
  ADD CONSTRAINT applications_drive_id_fkey FOREIGN KEY (drive_id)
    REFERENCES public.drives(id) ON DELETE RESTRICT;

ALTER TABLE public.departments
  ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.companies
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE TRIGGER set_departments_updated_at BEFORE UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_companies_updated_at BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Read-only student-drive scope is enforced here, even for direct REST requests.
-- The caller cannot supply another student's ID. Unknown CGPA/backlogs fail a
-- configured threshold; null thresholds impose no requirement.
CREATE FUNCTION public.can_read_student_drive(target_drive_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.students s
    JOIN public.profiles p ON p.id = s.user_id AND p.role = 'student'
    JOIN public.drives d ON d.id = target_drive_id
    WHERE s.user_id = auth.uid()
      AND d.status IN ('published', 'completed')
      AND (cardinality(d.eligible_graduation_years) = 0
        OR s.graduation_year = ANY(d.eligible_graduation_years))
      AND (d.min_cgpa IS NULL OR s.cgpa >= d.min_cgpa)
      AND (d.max_backlogs IS NULL OR s.backlogs <= d.max_backlogs)
      AND (
        NOT EXISTS (SELECT 1 FROM public.drive_departments dd WHERE dd.drive_id = d.id)
        OR EXISTS (SELECT 1 FROM public.drive_departments dd
          WHERE dd.drive_id = d.id AND dd.department_id = s.department_id)
      )
  );
$$;
REVOKE ALL ON FUNCTION public.can_read_student_drive(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_student_drive(UUID) TO authenticated;
DROP POLICY "Authenticated users can read drives" ON public.drives;
CREATE POLICY "Students can read eligible published drives" ON public.drives
  FOR SELECT TO authenticated USING (public.can_read_student_drive(id));

COMMIT;
