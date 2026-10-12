import { useEffect, useState } from 'react';
import ModulePage from '../../components/layout/ModulePage';
import DataTable from '../../components/ui/DataTable';
import StatusBadge from '../../components/ui/StatusBadge';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { listStudentDrives } from '../../services/recruitmentService';
import { useAuth } from '../../hooks/useAuth';

const columns = [
  { key: 'title', label: 'Drive' },
  { key: 'company', label: 'Company', render: (row) => row.companies?.name ?? '—' },
  { key: 'start_date', label: 'Start date' },
  { key: 'departments', label: 'Departments', render: (row) =>
    row.drive_departments?.map((item) => item.departments?.code).filter(Boolean).join(', ') || 'All departments' },
  { key: 'eligible_graduation_years', label: 'Graduation years', render: (row) =>
    row.eligible_graduation_years?.join(', ') || 'All years' },
  { key: 'min_cgpa', label: 'Minimum CGPA', render: (row) => row.min_cgpa ?? 'No minimum' },
  { key: 'max_backlogs', label: 'Maximum backlogs', render: (row) => row.max_backlogs ?? 'No limit' },
  { key: 'application_deadline', label: 'Deadline', render: (row) =>
    row.application_deadline ? new Intl.DateTimeFormat('en-IN', {
      dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata',
    }).format(new Date(row.application_deadline)) : 'Not set' },
  { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} /> },
];

export default function StudentDrives() {
  const { user } = useAuth();
  const [state, setState] = useState({ loading: true, rows: [], error: null });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, rows: [], error: null });
    listStudentDrives().then(
      (rows) => { if (!cancelled) setState({ loading: false, rows, error: null }); },
      (error) => { if (!cancelled) setState({ loading: false, rows: [], error }); },
    );
    return () => { cancelled = true; };
  }, [user?.id]);

  return (
    <ModulePage title="Recruitment Drives" description="Published recruitment drives matching your student eligibility. Deadlines are shown in India time.">
      {state.loading ? <LoadingState label="Loading recruitment drives…" /> : state.error ? (
        <ErrorState title="Could not load drives" error={state.error} />
      ) : (
        <DataTable columns={columns} rows={state.rows} caption="Eligible recruitment drives"
          emptyTitle="No matching recruitment drives"
          emptyMessage="There are no published drives matching your student record. Contact the Placement In-Charge if your record needs updating." />
      )}
    </ModulePage>
  );
}
