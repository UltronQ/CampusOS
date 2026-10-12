# M3-4 reports and export engine

Implemented all seven reports over current stored records:

1. `department_placement`: department-wise placement statistics.
2. `company_outcomes`: company-wise selections and valid offers.
3. `student_placement_history`: one row per student, multiple offers, application/drive outcomes and published stages.
4. `unplaced_students`: students without a valid scoped placement, including nonparticipants.
5. `pending_no_dues`: department-sorted incomplete or unconfigured statements, including rejected and missing mandatory decisions.
6. `no_dues_statement`: student statements with complete mandatory counts and active checklist details.
7. `batch_placement_summary`: final current summary for exactly one selected graduation batch, including highest/average valid INR packages.

Legacy `placement_summary` maps to the student placement report; `placement_offers` provides one row per successful offer. These preserve the existing M3-1 integration names. No AI feature or static application report is introduced.

## Files and team dependencies

Member 3 modules:

- `src/features/reports/reportDefinitions.js`: names, ordered headings and allowlisted columns.
- `reportEngine.js`: filter normalization, deterministic report construction and readable filter summaries.
- `exportReport.js`: fresh authorized queries, CSV/XLSX serialization, downloads and a dedicated print document.
- `ReportPage.jsx`: reusable report controls, previews, selected-student narrowing, export and print UI.
- `src/utils/csvSafety.js`: spreadsheet-safe CSV text, including dangerous prefixes after whitespace; numeric/boolean cells remain typed.
- `src/tests/reports.test.js`, `reports.database.test.js`: filtered values, serializers, limits and database authorization.
- `supabase/migrations/20261012000008_m3_report_snapshot.sql`: trusted report snapshot RPC.

Integration edits: shared `src/features/data/contracts.js` is v1.4; the in-charge Reports page delegates to the reusable page; `src/app/router.jsx` and navigation expose `/student/reports` with own-history/own-statement choices. The existing browser acceptance script additionally covers real filtered report downloads and print content.

Member 2 dependency: M2-4's `get_student_no_dues_statement` and mandatory-state rules. Reports reuse that server-calculated status, including `rejected`, `incomplete` and `not_configured`, rather than calculating a competing clearance rule. Member 3 placement reports reuse the M3-3 eligibility/unique-offer rules and cohort denominator. Member 1 continues to own routing and layout; the added wrappers preserve the existing route and component APIs.

Apply all currently present migrations in filename order. The report migration follows M2-4 and M3-3; its version 00008 leaves M2-5 versions 00006/00007 untouched. M2-5 and the Supabase configuration PR are now integrated with these reports; see [combined integration decisions](merged-pr-integration.md).

## Reusable API

```js
import { getReport, exportReport, downloadReportFile, printReportDocument }
  from '../features/reports/exportReport.js';

const input = {
  kind: 'student_placement_history',
  filters: { department_ids: [], graduation_years: [], company_ids: [],
    drive_ids: [], drive_statuses: [], drive_start_from: null, drive_start_to: null },
  student_ids: [], columns: [],
};
const preview = await getReport(input);
// Render preview.columns (key/heading), preview.rows and preview.filter_summary.
const file = await exportReport({ ...input, format: 'xlsx' });
downloadReportFile(file);
// Printing also reads a fresh authorized snapshot before constructing the document:
printReportDocument(await getReport(input));
```

`createReportingService(getClient)` supports real Supabase and test injection. `buildReport(snapshot,input)` and `serializeReport(report,format)` are pure transformations, not authorization boundaries. Production `getReport`/`exportReport` always invoke the trusted RPC. Export and print do not reuse an old preview snapshot. Never pass a role or actor ID from the UI.

No-dues kinds accept only `department_ids` and `graduation_years`. Placement kinds intersect all M3-3 filters. `student_ids` narrows student reports after authorization; aggregate department/company/batch reports reject this narrowing. Empty arrays mean unrestricted within the caller's authorized records. Columns are ordered allowlisted keys; duplicate or unknown columns reject. Narrowing displayed columns never narrows the mandatory checklist used to calculate overall status. Batch summaries require exactly one graduation year.

## Authorization and snapshots

`get_campusos_report_snapshot(p_kind)` is SECURITY DEFINER with an empty search path. It reads the caller's real authenticated profile before accessing records. In-charge may read all seven reports. Student may read only own placement/history/offers and own no-dues statements; consolidated kinds reject in PostgreSQL. Every private array is scoped through the authorized student CTE, including applications, offers and statements. Students receive only related drive/company/department metadata and published stage results. A forged student filter cannot broaden this scope. Public/anonymous execution is revoked; authenticated execution still requires a supported profile. No service-role key is used.

The snapshot is assembled in one SQL statement with a server timestamp and complete JSON arrays, avoiding inconsistent independent REST reads and row-limit truncation. Authorized history may display cancelled/withdrawn events when those drive statuses are explicitly selected, but such events never count as successful placements. No-dues overall status comes from every active mandatory item; optional/inactive items cannot create an incorrect Cleared statement.

Placement percentage remains **distinct placed students / selected department/batch cohort × 100**. Company/status/date filters narrow outcomes without redefining the cohort denominator. Department totals reconcile to the M3-3 dashboard. Package fields are integer minor units with explicit headings; missing packages stay null. The final batch summary is a current snapshot, not an immutable historical finalization record.

## Files, printing and limits

CSV: UTF-8 BOM, clear human column headings, CRLF and quoted commas/newlines. Dangerous text is neutralized with a leading apostrophe; numeric/boolean values are not converted into formula-like text. Leading-zero roll numbers remain strings in the data; CSV spreadsheet viewers may require text-column import settings.

XLSX: actual SheetJS workbook with `Report`, optional `Checklist items` and `Metadata` sheets. Roll numbers/text remain string cells without formulas. Metadata contains title, UTC snapshot, readable selected filters, scope and denominator. Headers have column widths and autofilters. No-dues detail rows include missing decisions, optional categories, remarks and pending requirements. The original server status remains on both the summary and item rows.

Filename: `campusos_<kind>[_batch-<years>]_<UTC-snapshot>.<csv|xlsx>`. No student names appear in filenames. `report_row_count` is the number of primary report records. CSV `row_count` equals that count; XLSX `row_count` sums data rows across every exported sheet, including checklist and metadata, and reconciles to `sheets`. Empty results still produce headers. Maximum export size is 50,000 report/checklist rows; exceeding it fails with EXPORT_LIMIT rather than truncating.

Printing builds a separate landscape document with title, date, readable filter names, column headings and complete checklist detail. Names/remarks are inserted using textContent, not untrusted HTML. It prints the report rather than the app sidebar and filter controls. The iframe is cleaned after printing.

## Verification and short acceptance procedure

Run:

```sh
node --test src/tests/*.test.js tests/*.test.js
npm run test:import-ui
npm run build
```

All 90 regression tests pass. The six browser acceptance groups cover analytics, filtered report CSV, no-dues XLSX/details, print content, mobile layout and the prior import workflow. Tests reopen generated files and check selected record IDs, package values, current name updates, real server clearance outcomes, text cell types and formula safety. PostgreSQL tests exercise the real migrations under authenticated/anonymous roles and prove students cannot retrieve other students or consolidated exports. Browser Auth transport is test-only; hosted Supabase JWT/login is not claimed verified.

Hosted acceptance: configure Supabase and apply missing migrations; sign in as in-charge; visit `/incharge/reports`; choose each report; intersect department/batch/company/status filters where applicable; export both formats; compare rows with preview/database and denominator with dashboard. Select one student for a no-dues statement and inspect all mandatory/optional details, then print. Select one batch for its final summary. Sign in as a linked student at `/student/reports`; verify own history/statement exports only and consolidated RPC denial. See [Supabase setup](supabase-setup.md).

Limitations: hosted credentials/accounts are still unsupplied; large snapshots are evaluated in the browser after server scoping, suitable for the hackathon dataset. Existing duplicate migration version prefixes require the documented SQL Editor sequence or coordinated migration-history cleanup before CLI deployment.

Suggested commit: `feat(reports): add authorized placement and no-dues CSV Excel exports`

## PR #7 conflict resolution

The M2-4 PR branch was updated at `4c2cfd8`, retaining current import contracts and new clearance types; GitHub verified the conflict-free result. The resolution also tolerates the previously created remarks column and restores clearance lifecycle guards around owner-only demonstration seeding. All 71 tests on that isolated branch passed. M3-3 is preserved at `7c58d8f`, M3-4 is committed at `67e0c84`, and main contains the combined PR 7/9/10 integration. Current verification is recorded in the combined integration guide.
