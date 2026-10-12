import ModulePage from '../../components/layout/ModulePage';

/** Module 4: live placement analytics with filters and Recharts visualisation. */
export default function Analytics() {
  return (
    <ModulePage
      title="Placement Analytics"
      description="Live placement statistics with department, graduation-year, company, drive and date filters. Charts will render service-computed numbers — the UI never recomputes or hardcodes totals."
      status="Scaffold — getPlacementAnalytics wiring pending (Member 3 service, Member 2 schema)"
    />
  );
}
