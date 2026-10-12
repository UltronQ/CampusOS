import ModulePage from '../../components/layout/ModulePage';

/** Module 2: recruitment-drive management (draft → published → completed / cancelled). */
export default function Drives() {
  return (
    <ModulePage
      title="Recruitment Drives"
      description="Create and manage recruitment drives with their lifecycle: draft, published, completed, cancelled. Cancelled drives are excluded from all placement statistics."
      status="Scaffold — CRUD pending Member 2 drives service"
    />
  );
}
