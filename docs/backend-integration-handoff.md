# M2-5 backend integration handoff

The backend now persists all eleven application entities, validates atomic student
imports, and provides current, filtered report rows with caller-scoped RLS. Apply
all migrations in filename order, each in its own transaction. The enum addition
in `20261012000004` must commit before `20261012000005` uses it. This work does
not apply migrations to a live Supabase project.

## Audit outcomes

| Requirement | Evidence |
| --- | --- |
| All entities persist | Executable seed loads profiles, departments, students, companies, drives, applications, stages/results, offers and categories/decisions |
| Foreign keys and uniqueness | Missing parents, duplicate applications/stages/checklists, duplicate auth links and case-insensitive email conflicts are tested |
| Invalid imports and duplicate rolls | Typed normalized JSON, server validation, whitespace normalization, insert-only uniqueness and atomic rollback after an earlier valid row |
| Student isolation and role escalation | Two student sessions test private tables, reports, profile upsert/update and forged helper arguments; anonymous RPCs are denied |
| Unauthorized applications/offers | Ownership RLS, immutable identities, restricted status changes and compensation tampering tests |
| Multiple offers and exclusions | Multiple offers per application persist; distinct placement totals and report rows exclude withdrawn/cancelled/declined/revoked records |
| Mandatory no-dues | Pending, rejected and missing mandatory decisions are incomplete; optional/inactive categories do not block |
| Current filtered reports | One snapshot RPC, intersecting department/batch/company/drive/status/date/student filters, deterministic ordering and explicit limits |
| Privileged operations | RLS plus trusted validation, explicit caller checks, protected definer search paths and no public-schema creation permission |

Fixed integration defects: missing import commit/report RPCs, invalid seed UUIDs,
illegal seed lifecycle inserts, cross-drive stage results, draft-stage visibility,
other-account helper lookups, temporary-table shadowing of trusted functions, and
CSV formula prefixes after whitespace. Existing recruitment/no-dues services remain
compatible; the UI badge now recognizes `incomplete`.

## Contracts reviewed against Members 1 and 3's repository code

| Consumer | Ready integration boundary |
| --- | --- |
| Member 1 auth | Existing session/profile exports are unchanged; roles come from `profiles`, never user metadata or a client parameter |
| Member 1 student/recruitment | Existing service names remain; CRUD returns persisted rows and RLS-hidden writes reject via `.single()` |
| Member 1 no-dues | Read `getStudentNoDuesStatement`; use `setClearanceStatus` and `getNoDuesProgress`; use clearance labels for Rejected / Further Action Required |
| Member 3 imports | `studentService.commitStudentImport(preview)` implements the documented insert-only/atomic preview boundary; department preview IDs are ignored |
| Member 3 reports | `reportService.queryReportRecords({kind,filters,student_ids,limit})` returns `{contract_version,snapshot_at,kind,filters,student_ids,row_count,rows}` |
| Member 3 no-dues analytics | Workflow `incomplete` maps to the legacy analytics `pending` bucket; rejected mandatory decisions are unresolved and are counted separately in workflow/report rows |

Shared contract version is `1.1.0`. CSV/XLSX parsing, chart/statistics aggregation,
file serialization/downloads and full UI screens remain owned by Members 1/3;
these planned modules are not present in this checkout. The backend import endpoint
revalidates normalized records; it cannot validate spreadsheet formula metadata or
file headers that were discarded by a parser. Member 3 must retain the documented
file/header/formula validation before building a preview. The CSV safety helper is
tested for typed values, leading whitespace, RFC quoting and CRLF.

This is a repository-based compatibility review, including an executed
import → database → filtered report → statement service contract test. GitHub
authorship identifies Member 1's frontend commit `e0e3370` as
`Indra-Sen-Ventrapragada` and Member 3's contract commit `1a25b58` as
`devisaicharan`; these are the intended PR reviewers. Human acknowledgement
remains pending and is not implied by automated checks.

## Import and report details

`commit_student_import(jsonb)` requires placement in-charge and normalized
`[{source_row,student:{student_number,full_name,email,department_code,graduation_year,cgpa?,phone?}}]`.
Identifiers/phone must be text, CGPA/year numeric, department must resolve, and
unknown fields are rejected. Server limits: 1–10,000 rows, years 1901–2099, CGPA
0–10. Department codes compare case-insensitively; emails are normalized and rolls
remain case-sensitive text with leading zeroes preserved. Stored CGPA uses two
decimal places. Auth provisioning and verified backlog values are separate from
student imports. Client preview flags are checked for usability, but never trusted
instead of database revalidation. Failure returns `committed:false`, zero inserted
rows, no IDs and safe `INVALID_INPUT`/`CONFLICT` issues; authorization rejects with
`FORBIDDEN`. No partial import survives a validation/unique conflict.

Report kinds: `placement_summary`, `placement_offers`, `no_dues_statement`.
Empty filter arrays mean unrestricted within RLS. Placement drive/date/company
filters change success rows, not the student cohort denominator. Summary rows
include unplaced students. Offers include only offered/accepted records on
non-withdrawn applications in published/completed drives. No-dues rows use the same
mandatory calculation as statements and include `mandatory_rejected` and
`overall_status: incomplete`. Member 3 may project the documented export columns
from these rows, but must never recompute overall status from a narrowed checklist.
Salary/currency values remain typed source data; this endpoint does not calculate
salary statistics or currency conversion.

The report limit is explicit (1–10,000) and excessive results raise `EXPORT_LIMIT`
instead of silently truncating. Invalid filters raise `INVALID_INPUT`; access and
unexpected failures become safe `FORBIDDEN`/`DATABASE_ERROR` errors. Narrowing a
student report to another student's ID returns zero rows, without revealing
whether the identity exists. Snapshot timestamps are server metadata.

## Reproducible checks

From the repository root, using the committed dependency lockfile:

```sh
npm ci
npm test
npm run test:integration
npm run build
```

The tests migrate fresh embedded PostgreSQL instances, use real non-superuser
`authenticated`/`anon` database roles and RLS, and run the actual seed. The Auth shim
creates only synthetic IDs and session claims; it does not issue real JWTs. Core
UUID generation substitutes for uuid-ossp. There are no fixture fallbacks in
production services and no service-role key in the browser client.

For disposable Supabase SQL verification, provision the three Auth identities
documented at the top of `supabase/seed/seed.sql`, apply all migrations, and load the
seed as database owner. Seed profile bootstrap is local setup; it then switches to
authenticated in-charge for domain writes. The file is atomic and deliberately
fails on a rerun; use a fresh database rather than masking duplicates. The executable
fixture retains the original five students, three successful offers and two placed
students. It omits the old impossible draft application/offer (seven applications
and seven offers total) and adds three stages/results. Two clear, two incomplete
and one unconfigured student reconcile with the no-dues report.

The existing standalone transactional suites can also run through psql:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/recruitment.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/no_dues.sql
```

The full M2-5 matrix is `tests/backend-integration.test.js`; failures preserve
SQLSTATE assertions and cases rollback individually. Migration 06 normalizes
existing student identities and validates stage links. Existing invalid rows or
normalization collisions must be resolved before deploying it; a failed migration
rolls back rather than dropping history. Live Supabase Auth/PostgREST sessions,
concurrent network requests and UI/import/export file flows have not been executed.
