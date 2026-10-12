import ModulePage from '../../components/layout/ModulePage';

/** Student view: own applications and recruitment-stage progress. */
export default function StudentApplications() {
  return (
    <ModulePage
      title="My Applications"
      description="Track your applications through each recruitment stage. Only published stage results are visible to you."
      status="Scaffold — pending Member 2 applications service with student-scoped RLS"
    />
  );
}
