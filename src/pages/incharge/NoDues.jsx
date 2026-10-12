import ModulePage from '../../components/layout/ModulePage';

/** Module 5: departmental no-dues checklists and approvals (in-charge view). */
export default function NoDues() {
  return (
    <ModulePage
      title="No-Dues Checklists"
      description="Configure per-department clearance items (mandatory/optional, active/inactive) and approve student clearances. Students can never approve their own clearances; approval evidence is recorded server-side."
      status="Scaffold — CRUD and approval pending Member 2 clearance service"
    />
  );
}
