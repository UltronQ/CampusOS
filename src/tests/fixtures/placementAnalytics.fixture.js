// Synthetic calculation fixtures only; never imported by production code.
export function analyticsFixture() {
  return {
    snapshot_at: '2026-10-12T10:00:00.000Z',
    departments: [{ id: 'cse', code: 'CSE' }, { id: 'ece', code: 'ECE' }],
    companies: [{ id: 'c1', name: 'Demo One' }, { id: 'c2', name: 'Demo Two' }],
    students: [
      { id: 's1', department_id: 'cse', graduation_year: 2027, cgpa: 9, backlogs: 0, placement_registered: true },
      { id: 's2', department_id: 'cse', graduation_year: 2027, cgpa: 8, backlogs: 0, placement_registered: true },
      { id: 's3', department_id: 'ece', graduation_year: 2028, cgpa: 7, backlogs: 0, placement_registered: true },
      { id: 's4', department_id: 'ece', graduation_year: 2028, cgpa: 8, backlogs: 0, placement_registered: false },
      { id: 's5', department_id: 'cse', graduation_year: 2027, cgpa: null, backlogs: null, placement_registered: true },
      { id: 's6', department_id: 'ece', graduation_year: 2028, cgpa: 8, backlogs: 0, placement_registered: false },
    ],
    drives: [
      { id: 'd1', company_id: 'c1', status: 'published', start_date: '2026-10-01', department_ids: ['cse'], graduation_years: [2027], minimum_cgpa: 8, maximum_backlogs: 0 },
      { id: 'd2', company_id: 'c2', status: 'completed', start_date: '2026-10-10', department_ids: ['cse'], graduation_years: [2027], minimum_cgpa: 8, maximum_backlogs: 0 },
      { id: 'd3', company_id: 'c1', status: 'cancelled', start_date: '2026-10-05' },
      { id: 'd4', company_id: 'c1', status: 'published', start_date: '2026-10-20', eligible_graduation_years: [2028], min_cgpa: 7 },
      { id: 'd5', company_id: 'c2', status: 'draft', start_date: '2026-10-25' },
    ],
    drive_departments: [{ drive_id: 'd4', department_id: 'ece' }],
    applications: [
      { id: 'a1', student_id: 's1', drive_id: 'd1', status: 'selected' },
      { id: 'a2', student_id: 's1', drive_id: 'd2', status: 'selected' },
      { id: 'a3', student_id: 's2', drive_id: 'd1', status: 'selected' },
      { id: 'a4', student_id: 's3', drive_id: 'd3', status: 'selected' },
      { id: 'a5', student_id: 's3', drive_id: 'd4', status: 'withdrawn' },
      { id: 'a6', student_id: 's6', drive_id: 'd4', status: 'selected' },
      { id: 'a7', student_id: 's2', drive_id: 'd2', status: 'in_progress' },
      { id: 'a8', student_id: 's5', drive_id: 'd1', status: 'selected' },
      { id: 'a9', student_id: 's4', drive_id: 'd4', status: 'rejected' },
    ],
    offers: [
      { id: 'o1', application_id: 'a1', status: 'offered', annual_ctc_minor: '100', currency: 'INR' },
      { id: 'o2', application_id: 'a2', status: 'accepted', annual_ctc_minor: 200, currency: 'INR' },
      { id: 'o3', application_id: 'a3', status: 'offered', annual_ctc_minor: null, currency: 'INR' },
      { id: 'o4', application_id: 'a4', status: 'accepted', annual_ctc_minor: 900, currency: 'INR' },
      { id: 'o5', application_id: 'a5', status: 'accepted', annual_ctc_minor: 800, currency: 'INR' },
      { id: 'o6', application_id: 'a1', status: 'declined', annual_ctc_minor: 700, currency: 'INR' },
      { id: 'o7', application_id: 'a1', status: 'revoked', annual_ctc_minor: 600, currency: 'INR' },
      { id: 'o8', application_id: 'a8', status: 'accepted', annual_ctc_minor: 500, currency: 'INR' },
      { id: 'o9', application_id: 'a9', status: 'offered', annual_ctc_minor: 900, currency: 'INR' },
    ],
  };
}
