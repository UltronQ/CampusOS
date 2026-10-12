import ModulePage from '../../components/layout/ModulePage';

/** Student view: own offers (multiple offers supported, none hidden). */
export default function StudentOffers() {
  return (
    <ModulePage
      title="My Offers"
      description="All offers you have received, including multiple offers from different drives, with status and CTC where published."
      status="Scaffold — pending Member 2 offers service with student-scoped RLS"
    />
  );
}
