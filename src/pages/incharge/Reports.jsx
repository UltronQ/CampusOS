import ModulePage from '../../components/layout/ModulePage';

/** Module 6: filterable statements, reports and CSV/Excel exports. */
export default function Reports() {
  return (
    <ModulePage
      title="Reports & Exports"
      description="Generate filterable placement and no-dues statements and export them as CSV or Excel. Exports are real files produced from an authorized database snapshot — spreadsheet-safe and injection-defended."
      status="Scaffold — exportReport wiring pending (Member 3 serializer, Member 2 authorized queries)"
    />
  );
}
