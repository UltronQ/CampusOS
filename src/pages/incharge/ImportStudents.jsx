import ModulePage from '../../components/layout/ModulePage';

/** Module 1: validated CSV/XLSX student import (Member 3 parser + Member 2 commit). */
export default function ImportStudents() {
  return (
    <ModulePage
      title="Import Students"
      description="Validated CSV/XLSX import. The file parser returns row-level errors and a preview; the commit runs in a single trusted transaction. Imports are insert-only and atomic — nothing is written when any row is invalid."
      status="Scaffold — validateStudentFile UI wiring pending (Member 3 parser, Member 2 commitStudentImport)"
    />
  );
}
