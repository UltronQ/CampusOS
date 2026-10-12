# M3-1 fixture specifications

Fixture source: src/tests/fixtures/data-contracts.fixture.js. These are synthetic records, not application dashboard data. Expected objects omit snapshot_at, filters and contract_version; implementations add those metadata fields. Never use these fixtures as a production service fallback.

M2-5 executable database seed is `supabase/seed/seed.sql`. Its valid UUIDs and
lawful lifecycle writes preserve the expected totals, but omit the legacy draft
application/offer that new backend guards prohibit (seven applications/offers
instead of eight). It adds two student Auth links and three stages/results.
Workflow statements/reports use `incomplete` where this legacy analytics fixture
uses `pending`. See `docs/backend-integration-handoff.md` for reproducible checks.

## Base calculations

Unfiltered placement: 5 students, 2 distinct placed, 3 unplaced, 40% placement rate, 5 non-withdrawn applications, 3 successful offers, 1 student with multiple offers. Only o1/o2/o6 qualify. Salary count=2, min=10,000,000 paise, max=20,000,000, mean/median=15,000,000. Null salary on o6 does not remove s4 from placement counts. Department expected objects are in the fixture.

Unfiltered no-dues: 2 cleared, 2 pending, 1 not_configured, 40% clearance rate. Mandatory student-item pairs total 7: 2 cleared, 1 not_applicable, 1 pending, 3 missing. s1 is cleared despite optional/inactive pending items. s2/s3 pending; s4 cleared; s5 not_configured.

## Filter variants (derive from independent copy of base fixture)

- department_ids=[cse]: total=3, placed=1, unplaced=2, rate=33.33%, applications=4, offers=2, multi-offer students=1. Clearance: 1 cleared, 2 pending, 0 unconfigured.
- company_ids=[co1]: total=5, placed=1, applications=2, offers=1, multi=0, salary=10,000,000 throughout. No-dues does not accept company filters.
- drive_start_from=drive_start_to=2026-10-12: total=5, placed=2, applications=3, offers=2, multi=0, salary count=1 with 20,000,000 throughout.
- drive_ids=[d3] or [d4]: total=5, placed=0, applications=0, offers=0, salary count=0/null stats.
- graduation_years=[2028]: total=0, counts=0, rates=null, salary stats=null, by_department empty.
- Unknown valid-format drive ID: zero matching offers and unchanged cohort. Unknown cohort department ID: empty cohort. Reject malformed IDs at the service boundary appropriate to production UUID IDs.
- Intersect CSE and co2: total=3, placed=1, applications=2, offers=1, salary=20,000,000, rate=33.33%.
- Duplicated/reordered filter IDs give identical canonical filter arrays and metrics. Invalid date, inverted bounds, cancelled/draft status request: INVALID_INPUT.

## Import cases

Use validImportRows with context: valid=2, invalid=0, total=2, preview insert_count=2, blocked_count=0, source rows 2/3, normalized values equal expectedNormalizedImportRows. Successful committed database records resolve CSE/ECE IDs and preserve 006/007 text.

Generate CSV and XLSX versions of each case:
- Valid optional columns omitted; normalized cgpa/phone null. BOM accepted. Blank physical rows ignored without renumbering later source rows.
- Duplicate student_number across both rows: both invalid. Duplicate email with different case/whitespace: both invalid.
- Existing number 001 or existing ONE@EXAMPLE.TEST: conflict error, can_commit false. No upsert.
- Unknown department, blank required value, malformed email, year 2027.5/outside bounds, cgpa -1/10.01/NaN/8abc, invalid phone: relevant field errors.
- Numeric identifier cell, formula or Excel error: invalid, no lost-leading-zero recovery.
- Unknown/duplicate/missing required headers, empty file, header-only file, multiple nonempty XLSX sheets, unsupported extension, max_rows+1: file errors block commit.
- Mixed one valid/one invalid: preview may show one insert candidate, can_commit=false; commit must insert zero.
- Concurrent insert of same identity after preview: trusted transaction rejects, zero partial inserts.

Suggested stable validation codes: REQUIRED, INVALID_EMAIL, UNKNOWN_DEPARTMENT, INVALID_YEAR, INVALID_CGPA, INVALID_PHONE, DUPLICATE_STUDENT_NUMBER, DUPLICATE_EMAIL, EXISTING_STUDENT_NUMBER, EXISTING_EMAIL, IDENTIFIER_NOT_TEXT, FORMULA_CELL, EXCEL_ERROR, UNKNOWN_HEADER, DUPLICATE_HEADER, MISSING_HEADER, EMPTY_FILE, MULTIPLE_SHEETS, UNSUPPORTED_FILE, ROW_LIMIT. Parser and UI should share these codes when implemented.

## Calculation edge mutations

- Add successful offer to s1's a1: offer count rises by one, placed unchanged; stage rows never multiply counts.
- Revoke o1: s1 remains placed by o2, multi count drops to zero. Withdraw a2: o2 disappears, s1 still placed through o1.
- All salaries null: salary count=0/null stats, placed count unchanged.
- Salaries [0,1]: mean/median=1 paise (half-up), zero included. Negative/noninteger/mixed currency: integrity failure.
- Remove cl1: s1 pending, missing rises by one. Mark i2 optional: it stops affecting mandatory pair counts. Remove all active mandatory CSE items: all CSE students not_configured.
- Terminal clearance without approved_by/approved_at, cross-department decision or duplicate student-item decision: integrity failure.
- One remaining mandatory decision pending prevents Cleared even if a statement displays only cleared items.

## Reports and security

Base placement_summary: 5 rows; placement_offers: 3 rows with o1/o2/o6; no_dues_statement: 5 rows with statuses cleared,pending,pending,cleared,not_configured by student number. Sum summary successful_offer_count=3, placed rows=2. No-dues statement status totals reconcile with analytics. Department/date filter exports reconcile with corresponding analytics. student_ids=[s1] produces one summary row, two offer rows, one statement row.

Reopen CSV with Papa Parse and XLSX with SheetJS: ordered headers, IDs as text in XLSX, Unicode, commas, quotes, embedded newline, empty null cells, exact integer money. Test names starting =,+,-,@ or leading whitespace then formula marker: CSV text is neutralized and XLSX never has formula properties. CSV BOM/CRLF and MIME/extension match; zero rows produces header-only file; row limit throws instead of truncating. Compare repeated runs ignoring snapshot metadata/filename date and XLSX packaging metadata.

RLS end-to-end: student s1 can read/export only own records and published results; forged student_ids=s2, cross-student direct select/update and clearance self-approval fail. Unauthenticated access fails. In-charge can manage/import authorized records and approve clearances. Publish/unpublish stage result and check student visibility. Verify browser bundle has no service-role key. These tests require Member 2 migrations and services, Member 1 UI, and actual Supabase sessions.

## Short execution procedure after integration

1. Seed synthetic fixture through Member 2 seed tooling with UUID mapping and two real test auth sessions.
2. Run fixture-driven parser/calculation/export tests against the documented expected values.
3. Import two valid students in the UI; reload and confirm persistence. Attempt mixed-invalid and conflicting import; confirm no partial inserts.
4. Change an offer, drive and mandatory clearance as in-charge; refresh analytics, reopen exports and compare counts/statuses.
5. Run student authorization checks above using direct Supabase requests as well as UI controls.

M3-1 only supplies contracts/specifications and syntax/reconciliation smoke checks. This procedure is pending until implementations and database are available.
