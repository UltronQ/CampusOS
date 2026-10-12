import ModulePage from '../../components/layout/ModulePage';
import { EmptyState } from '../../components/ui/States';

/** Student dashboard: own placement summary + overall clearance status. */
export default function StudentDashboard() {
  return (
    <ModulePage
      title="My Dashboard"
      description="Your placement summary and no-dues clearance status. Every figure comes from your own authorized records — other students' data is never visible to you."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <EmptyState title="Placement summary pending">
          Your offers, placement status and published recruitment results will
          appear here once the placement service is connected.
        </EmptyState>
        <EmptyState title="Clearance status pending">
          Your department's no-dues checklist progress will appear here,
          including which departments have cleared you.
        </EmptyState>
      </div>
    </ModulePage>
  );
}
