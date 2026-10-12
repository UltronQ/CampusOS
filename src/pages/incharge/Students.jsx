import ModulePage from '../../components/layout/ModulePage';

/** Module 1: student & department management (list, create, edit, delete). */
export default function Students() {
  return (
    <ModulePage
      title="Students"
      description="Manage student records and department enrollment. Create, read, update and permitted deletes go through the students service with RLS-authorized queries."
      status="Scaffold — CRUD pending Member 2 students service"
    />
  );
}
