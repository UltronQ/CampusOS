# M3-1 data contracts and integration agreement

Status: proposed v1. No Member 2 schema or Problem Statement PDF exists in this checkout. Member 2 must confirm the mapping and enums before service implementation; any PDF-specific rule takes priority. No database service or end-to-end feature is claimed complete here.

## Files and ownership

Created now (Member 3): src/features/data/contracts.js, docs/data-contracts.md, docs/data-fixture-specifications.md, src/tests/fixtures/data-contracts.fixture.js. No other member files are changed. Contracts use JSDoc in ordinary JavaScript; consumers can use import('./contracts.js').TypeName in JSDoc. The exported constants are real JavaScript; function typedefs describe future implementations, not callable stubs.

Planned Member 3 modules:
- src/features/import/studentImport.js: validateStudentFile(file, context), buildImportPreview(validation, context).
- src/features/analytics/placementAnalytics.js: getPlacementAnalytics(filters).
- src/features/analytics/noDuesAnalytics.js: getNoDuesAnalytics(filters).
- src/features/reports/exportReport.js: exportReport(input).
- src/utils/csvSafety.js: spreadsheet-safe text serialization.
- src/tests/import.test.js, analytics.test.js, reports.test.js: fixture-driven tests when implementations exist.

Dependencies: Member 2 owns Supabase migrations, RLS, auth, recruitment and clearance services. Member 1 owns file selection, preview tables, filter controls, loading/error states, charts, and download UI. Member 3 implements parsers, calculations and serializers after contracts are agreed. Papa Parse handles CSV; SheetJS handles XLSX; no new package manifest is added in this task.

## Proposed database mapping for Member 2

All properties use snake_case matching proposed DB columns. IDs are opaque strings (production UUIDs); fixtures use readable IDs. Foreign keys and uniqueness must be enforced in PostgreSQL.

- profiles: id -> auth.users.id, role = placement_incharge | student. No third role.
- departments: id, code (unique), name.
- students: id, user_id (nullable unique auth link), student_number (unique), full_name, email (case-insensitive unique), department_id, graduation_year, cgpa (nullable 0..10), phone (nullable text). Import department_code resolves to department_id; it is not a students column.
- companies: id, name.
- drives: id, company_id, title, start_date (date), status = draft | published | completed | cancelled.
- applications: id, student_id, drive_id, status = applied | in_progress | selected | rejected | withdrawn; unique(student_id, drive_id).
- recruitment_stages: id, drive_id, name, sequence (unique within drive).
- application_stage_results: id, application_id, stage_id, status = pending | passed | failed, published_at (nullable). Student reads only published results.
- offers: id, application_id, status = offered | accepted | declined | revoked, annual_ctc_minor (nullable nonnegative integer), currency = INR. Multiple offers per student and application are supported; do not add a unique student constraint.
- clearance_items: id, department_id (student cohort department), name, is_mandatory, is_active. For v1 all active department items apply to every student in that department. More complex applicability needs a schema agreement.
- student_clearances: id, student_id, clearance_item_id, status = pending | cleared | not_applicable, approved_by (nullable profile ID), approved_at (nullable server timestamp); unique(student_id, clearance_item_id). Approval fields required for cleared/not_applicable. Only in-charge approves either state.

Member 2 may use existing names/enums if provided later: adapt in the Member 3 data boundary, keep the documented DTO stable, and record the mapping. Do not create competing migrations. In-charge must read authorized records and write through RLS/trusted functions; students read only their own records and published results. No student permission to change clearance decisions, offers or stage results. Aggregate endpoints and export queries must enforce the same authorization, not accept an actor/role from the browser. SECURITY DEFINER functions, if used, must explicitly check caller rights and set a safe search_path.

## Import validation and commit rules

v1 is insert-only and atomic. CSV UTF-8 (BOM accepted) and XLSX are supported; use the first nonempty sheet and report its name, reject additional nonempty sheets to avoid silent omissions. Header names are exact IMPORT_HEADERS after trimming BOM/whitespace; unknown or duplicate headers are errors. First five fields are required; cgpa/phone headers are optional. Ignore wholly blank rows, preserve physical row numbers, and reject a header-only file.

Trim all text. Full name/student number must be nonempty; student number is text. Lowercase email and validate a conventional email structure (no claim of deliverability). Uppercase department code and resolve exactly one database department. Graduation year must be a finite integer inside the explicit configured range. CGPA blank -> null, otherwise a finite decimal 0..10; reject malformed numeric text instead of coercing it to zero. Phone blank -> null; preserve leading +/zeroes and require only digits, spaces, hyphens or parentheses with 7..15 digits. Reject Excel error cells, formulas in import cells, unsafe/unsupported file types and files exceeding configured max_rows. Numerically stored student numbers/phones are errors because leading zeroes cannot be recovered reliably; tell users to format identifiers as text.

Duplicates by trimmed student_number or normalized email, within the file or against existing authorized DB records, block the entire import. Mark every member of a duplicate group invalid. File errors set can_commit=false. A row is valid only with zero errors; warnings do not block. total_rows=valid_rows+invalid_rows; warning_rows counts rows, not messages. Preview rows are valid normalized rows only; blocked_count=invalid_rows, insert_count=rows.length. Preview does not write. can_commit requires at least one valid row, no invalid rows and no file errors.

Member 2 integration: commitStudentImport(preview) revalidates all values, department references and uniqueness in a single trusted transaction. Client preview is untrusted. Success returns committed=true and an ID per source row; failure returns committed=false, inserted_count=0 and no students. Concurrent conflicts roll back all inserts; database errors must not leak SQL, secrets or another student's private record. Auth account provisioning is a separate Member 2 concern.

## Deterministic placement calculations

Read a single authorized database snapshot (prefer one SQL query/RPC). Do not fetch independently paginated tables and assume completeness. Server-generated snapshot_at is metadata and never affects counts. Reject invalid IDs/dates, inverted ranges and unsupported statuses. Empty arrays mean unrestricted; deduplicate and sort arrays for canonical filters.

1. Cohort = students matching department_ids AND graduation_years. total_students is the cohort size, including students with no applications.
2. Eligible drives have status published or completed and match company_ids, drive_ids, drive_statuses, and inclusive drive start-date bounds. Draft/cancelled are always excluded.
3. Applications join cohort and eligible drives; withdrawn applications are excluded from all application, offer and placement metrics.
4. Successful offers have status offered or accepted and join the scoped applications. A selected application alone is not evidence of an offer. Declined/revoked offers never count. Placed = distinct successful-offer student IDs; unplaced=total-placed; multiple-offer students have at least two successful offer IDs in scope.
5. placement_rate = {numerator:placed, denominator:total, percent: total ? round(100*placed/total,2) : null}. This is placement coverage within selected drives/companies, not an eligibility conversion rate. No eligibility population is inferred.
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
