import ModulePage from '../../components/layout/ModulePage';
import { EmptyState } from '../../components/ui/States';

/** In-charge dashboard. Stats must come from getPlacementAnalytics — never hardcoded. */
export default function InchargeDashboard() {
  return (
    <ModulePage
      title="Dashboard"
      description="Live placement and no-dues overview for your institution. All statistics will be computed by the analytics service from a database snapshot — nothing on this page is hardcoded."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <EmptyState title="Placement overview pending">
          Placement rate, offers and salary statistics will render here from
          getPlacementAnalytics once Member 2's schema and Member 3's analytics
          service are connected.
        </EmptyState>
        <EmptyState title="No-dues overview pending">
          Department clearance summaries will render here from getNoDuesAnalytics.
        </EmptyState>
      </div>
    </ModulePage>
  );
}
