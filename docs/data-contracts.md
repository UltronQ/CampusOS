# M3-1 data contracts and integration agreement

Status: v1.2 aligned with Member 2's migrations 00001 through 00004. M2-2 supplies import persistence and M3-2 supplies CSV/XLSX parsing, validation, previews, templates and confirmation integration. The Problem Statement PDF has not been supplied; any PDF-specific rule takes priority. Analytics and report exports remain later feature implementations.

## Files and ownership

Created now (Member 3): src/features/data/contracts.js, docs/data-contracts.md, docs/data-fixture-specifications.md, src/tests/fixtures/data-contracts.fixture.js. No other member files are changed. Contracts use JSDoc in ordinary JavaScript; consumers can use import('./contracts.js').TypeName in JSDoc. The exported constants are real JavaScript; function typedefs describe future implementations, not callable stubs.

Planned Member 3 modules:
- src/features/import/studentImport.js: validateStudentFile(file, context), buildImportPreview(validation, context).
- src/features/analytics/placementAnalytics.js: getPlacementAnalytics(filters).
- src/features/analytics/noDuesAnalytics.js: getNoDuesAnalytics(filters).
- src/features/reports/exportReport.js: exportReport(input).
- src/utils/csvSafety.js: spreadsheet-safe text serialization.
- src/tests/import.test.js, analytics.test.js, reports.test.js: fixture-driven tests when implementations exist.

Dependencies: Member 2 owns Supabase migrations, RLS, auth, recruitment and clearance services. Member 1 owns file selection, preview tables, filter controls, loading/error states, charts, and download UI. Member 3 implements parsers, calculations and serializers. Papa Parse, SheetJS and Recharts are installed in the shared root package; use npm ci to reproduce the lockfile.

## Current database mapping for the team

All properties use snake_case matching proposed DB columns. IDs are opaque strings (production UUIDs); fixtures use readable IDs. Foreign keys and uniqueness must be enforced in PostgreSQL.

- profiles: id -> auth.users.id, role = placement_incharge | student. No third role.
- departments: id, code (unique), name.
- students: id, user_id (nullable unique auth link), student_number (unique), full_name, email (case-insensitive unique), department_id, graduation_year, cgpa (nullable NUMERIC(4,2), 0..10), phone (nullable text), backlogs (nullable nonnegative integer; unknown is not zero). Import department_code resolves to department_id; it is not a students column. Batch is represented by graduation_year.
- companies: id, name.
- M2-2 student extensions: program (nullable text), academic_year (nullable integer 1–8), section (nullable text), placement_registered (boolean default false), eligibility_status (pending | eligible | ineligible, default pending). They are management fields distinct from drive-threshold eligibility. Import settings/history and API details are in m2-2-authentication-student-services.md.
- drives: id, company_id, title, start_date (date), status = draft | published | completed | cancelled, eligible_graduation_years (integer array; empty = all), min_cgpa (nullable 0..10), max_backlogs (nullable nonnegative integer), application_deadline (nullable timestamp).
- drive_departments: drive_id, department_id (composite primary key with foreign keys). No rows for a drive means all departments. Drive/student deletion is blocked by linked applications; company deletion is blocked by linked drives.
- applications: id, student_id, drive_id, status = applied | in_progress | selected | rejected | withdrawn; unique(student_id, drive_id).
- recruitment_stages: id, drive_id, name, sequence (unique within drive).
- application_stage_results: id, application_id, stage_id, status = pending | passed | failed, published_at (nullable). Student reads only published results.
- offers: id, application_id, status = offered | accepted | declined | revoked, annual_ctc_minor (nullable nonnegative integer), currency = INR. Multiple offers per student and application are supported; do not add a unique student constraint.
- clearance_items: id, department_id (student cohort department), name, is_mandatory, is_active. For v1 all active department items apply to every student in that department. More complex applicability needs a schema agreement.
- student_clearances: id, student_id, clearance_item_id, status = pending | cleared | not_applicable, approved_by (nullable profile ID), approved_at (nullable server timestamp); unique(student_id, clearance_item_id). Approval fields required for cleared/not_applicable. Only in-charge approves either state.

Adapt future schema changes at the Member 3 data boundary and record any versioned DTO change. Do not create competing migrations. In-charge must read authorized records and write through RLS/trusted functions; students read only their own records and published results. No student permission to change clearance decisions, offers or stage results. Aggregate endpoints and export queries must enforce the same authorization, not accept an actor/role from the browser. SECURITY DEFINER functions must explicitly check caller rights and set a safe search_path. listStudentDrives() accepts no student ID; database RLS checks the caller's linked student record, department, graduation year, CGPA and backlog thresholds. Draft/cancelled drives are hidden from that route.

## Import validation and commit rules

The default preview/current UI is insert-only and atomic; M3-2 exposes explicit partial mode and a confirmation dialog. Contract v1.2 includes confirmed persistence options and successful/skipped/duplicate/failed summaries. CSV UTF-8 (BOM accepted) and XLSX parsing is implemented in src/features/import/studentImport.js. Use one nonempty sheet and report its name; additional nonempty sheets block import. Header names are exact IMPORT_HEADERS after trimming BOM/whitespace, with optional program/academic_year/section/placement_registered/eligibility_status extensions. Unknown or duplicate headers are errors. First five fields are required; cgpa/phone/backlogs headers are optional. Ignore wholly blank rows, preserve physical row numbers, and reject a header-only file. Full M3-2 API/count/file-limit semantics are in m3-2-student-import.md.

Trim all text. Full name/student number must be nonempty; student number is text. Lowercase email and validate a conventional email structure (no claim of deliverability). Uppercase department code and resolve exactly one database department. Graduation year must be a finite integer inside the explicit configured range. CGPA blank -> null, otherwise a finite decimal 0..10; reject malformed numeric text instead of coercing it to zero. Phone blank -> null; preserve leading +/zeroes and require only digits, spaces, hyphens or parentheses with 7..15 digits. Reject Excel error cells, formulas in import cells, unsafe/unsupported file types and files exceeding configured max_rows. Numerically stored student numbers/phones are errors because leading zeroes cannot be recovered reliably; tell users to format identifiers as text.

Duplicates by trimmed student_number or normalized email, within the file or against existing authorized DB records, block atomic imports and are excluded in explicit partial mode. Mark every member of a duplicate group invalid. File errors block both modes. A row is valid only with zero errors; warnings do not block. total_rows=valid_rows+invalid_rows; warning_rows/duplicate_rows count rows, not messages. Preview rows are valid normalized rows only; blocked_count=invalid_rows, insert_count=rows.length. Preview does not write. can_commit requires at least one valid row, no invalid rows and no file errors; can_commit_partial requires at least one valid row and no file errors. Preview.can_commit chooses the flag for its mode. Backend-only counts describe submitted rows; the workflow separately merges local rejection outcomes across the whole file and exposes backend_counts for audit reconciliation.

Backlogs blank or omitted -> null (unknown); otherwise require a nonnegative integer within PostgreSQL INTEGER bounds. Do not coerce an unknown backlog count to zero. CGPA is validated before persistence; its database representation stores two decimal places.

Member 2 integration: commitStudentImport(preview, {confirmed:true}) revalidates values, department references and uniqueness in one trusted transaction. Client preview is untrusted. Atomic success returns committed=true and an ID per source row; rejection returns committed=false, inserted_count=0 and no students, with failed invalid rows and skipped otherwise-valid rows. Concurrent conflicts roll back atomic inserts; explicit partial mode skips conflicting identities and persists other valid rows. Every response includes authoritative successful_count, skipped_count, failed_count, duplicate_count, total_count, row_results and history_id. Database errors must not leak SQL, secrets or another student's private record. Auth account provisioning is through Supabase/trusted admin tooling, never a client-assigned role.

## Deterministic placement calculations

Read a single authorized database snapshot (prefer one SQL query/RPC). Do not fetch independently paginated tables and assume completeness. Server-generated snapshot_at is metadata and never affects counts. Reject invalid IDs/dates, inverted ranges and unsupported statuses. Empty arrays mean unrestricted; deduplicate and sort arrays for canonical filters.

1. Cohort = students matching department_ids AND graduation_years. total_students is the cohort size, including students with no applications; it is not the placement-rate denominator.
2. Eligible drives have status published or completed and match company_ids, drive_ids, drive_statuses, and inclusive drive start-date bounds. Draft/cancelled are always excluded.
3. eligible_students = distinct cohort students satisfying the department, graduation-year, min_cgpa and max_backlogs requirements for at least one scoped drive. Null thresholds impose no requirement; unknown student CGPA/backlogs fail a configured threshold. Empty year/department selections on a drive impose no restriction. Deadline affects future application acceptance, not historical analytics eligibility. Applications join cohort and scoped drives; withdrawn applications are excluded from all application, offer and placement metrics. Successful placement counts additionally require student eligibility for the offer's drive in the snapshot.
4. Successful offers have status offered or accepted and join the scoped applications. A selected application alone is not evidence of an offer. Declined/revoked offers never count. Placed = distinct successful-offer student IDs; unplaced=total-placed; multiple-offer students have at least two successful offer IDs in scope.
5. placement_rate = {numerator:placed, denominator:eligible_students, percent: eligible_students ? round(100*placed/eligible_students,2) : null}. Eligibility is a union across scoped drives, never a sum that double-counts a student. unplaced_students = total_students - placed_students. Department summaries use the same eligible-student denominator. No matching drives gives eligible_students=0 and percent=null even when the cohort is nonempty. This aligns the contract with the supplied M3-3 prompt before its implementation.
6. Salary stats include non-null annual_ctc_minor from successful offers (offer-weighted, including multiple offers). Zero is a valid value; negative/noninteger/mixed-currency data is a data integrity error. count is salaries, not students. Sort ascending; median is center or mean of two centers, mean=sum/count, both rounded to nearest integer paise using half-up. Empty values yield count=0 and null min/max/mean/median. Currency is INR; no currency conversion.
7. by_department includes every cohort department, even with zero placements; summaries sum to overall counts. Use department_code then ID for deterministic ordering; SQL joins must not multiply offers through stages.

Use integer/rational arithmetic and explicit half-up rounding for percentages and money, with safe-integer bounds checked. For an empty cohort, all counts are zero and rates/statistics are null as specified. Return failures rather than partial/stale successful counts. Future policy changes to successful offer statuses require a versioned contract change.

## Deterministic no-dues calculations

Cohort filtering matches placement cohort filters. For each student find all active mandatory items applicable through their department. Missing student_clearances rows count as missing and prevent clearance. Overall cleared requires at least one active mandatory item AND every such item explicitly cleared or not_applicable with in-charge approval evidence. Otherwise pending. If no mandatory items are configured, return not_configured, never Cleared. Optional items and inactive items do not block. An overall statement must use the full applicable mandatory set regardless of which items are displayed. Duplicate decisions are prevented by DB uniqueness; mismatched department decisions and terminal decisions without approval evidence are integrity errors.

mandatory_items counts student-item pairs (not template definitions) partitioned into cleared, not_applicable, pending, missing. cleared_students+pending_students+not_configured_students=total_students. clearance_rate uses cleared/total with the same rate rounding. by_department partitions the cohort and sorts like placement analytics.

## Reports and Member 1 signatures

Member 1 will import the named implementation functions from the planned modules and supply contracts.js DTOs. Await validateStudentFile -> render errors/preview -> invoke Member 2 commitStudentImport only when can_commit. Filters are controlled arrays and nullable dates; do not use labels as IDs. Await analytics and render supplied numbers; do not recompute placed_students from offers in the UI. Async service failures reject with a DataFeatureError-shaped error; import validation failures are returned as validation results. Clear stale success state on failure.

exportReport returns a real Blob; Member 1 creates an object URL, downloads using filename, and revokes the URL. Student scope is enforced server-side even when student_ids is empty or forged. Placement filters apply to placement kinds; no-dues kinds accept only no-dues filters. student_ids narrows rows after authorization and before aggregating any export-specific summary.

Default ordered columns:
- placement_summary: student_number, full_name, email, department_code, graduation_year, placed, successful_offer_count. Exactly one row per cohort student; placed is boolean.
- placement_offers: student_number, full_name, department_code, graduation_year, company_name, drive_title, application_status, offer_id, offer_status, annual_ctc_minor, currency. One row per successful offer in scope.
- no_dues_statement: student_number, full_name, department_code, graduation_year, overall_status, mandatory_total, mandatory_cleared, mandatory_not_applicable, mandatory_pending, mandatory_missing. One row per student, includes pending/unconfigured students.

Only columns from the selected kind's allowlist can be requested; reject duplicates/unknown names. Stable row sort: department_code, student_number, student_id, then offer_id for offer rows. Missing values export as empty cells. CSV has UTF-8 BOM, header, CRLF and RFC4180 quoting. Defend CSV formula injection: prefix a single quote for text whose first non-whitespace character is =, +, -, @, tab or carriage return; numeric/boolean cells remain typed. XLSX text cells must be typed as strings with no formula property. Preserve student numbers as text in both formats; spreadsheet viewers may require text import for CSV leading zeroes. XLSX has one Report sheet with header/frozen first row. Empty results still export headers and row_count=0. Reject report sizes above an explicit configured limit; never silently truncate. Filename campusos_<kind>_<server-UTC-date>.<extension>. Results and reports use the same snapshot calculations, not hardcoded dashboard totals.

## Verification and handoff

Fixtures and expected values are specified in data-fixture-specifications.md; the JS fixture is synthetic and contains no private records. Contract smoke check imports both JavaScript modules and verifies expected reconciliation identities. End-to-end tests await Member 2's schema, authorized seeded records, service implementations and Member 1 UI: import -> database read -> analytics -> export -> reopen file. Also test two student sessions against RLS and an in-charge session. These are not complete in M3-1.

Suggested commit: docs(data): define import analytics and export contracts with fixtures
