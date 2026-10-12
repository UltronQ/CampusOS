import ModulePage from '../../components/layout/ModulePage';

/** Student view: own no-dues clearance statuses (read-only, no self-approval). */
export default function StudentClearance() {
  return (
    <ModulePage
      title="My Clearance"
      description="Your department's no-dues checklist and per-item status. This view is read-only — clearance decisions are made by the Placement In-Charge, never by students."
      status="Scaffold — pending Member 2 clearance service with student-scoped RLS"
    />
  );
}
