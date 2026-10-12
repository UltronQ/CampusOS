# M2-4 configurable no-dues workflow

Apply `20261012000004_clearance_status.sql` and
`20261012000005_no_dues_workflow.sql` in order after the existing migrations.
Commit the enum migration before running the workflow migration; PostgreSQL cannot
use a newly added enum value in the transaction that creates it.

The existing `placement_incharge` role configures categories and changes decisions.
Students have read-only access to their own decisions and statements. No additional
approval role is introduced. RLS protects direct REST/table writes, and the decision
trigger additionally verifies the authenticated in-charge. All functions use a
fixed search path. Statements run as the caller with RLS; consolidated progress
and checklist initialization explicitly require placement in-charge.

## Categories and student records

Categories remain department-specific `clearance_items` with `name`,
`is_mandatory`, `is_active`, `created_at` and `updated_at`. All active categories
apply to students currently in that department. Batch means `graduation_year`.
Use `createClearanceItem`, `updateClearanceItem`,
`listClearanceItemsByDepartment`, and `deleteClearanceItem` from
`src/services/clearanceService.js`. Update name, mandatory/optional and active
flags; identity and department are immutable. Deactivate used categories to retain
history. Deletion of a category, department or student with clearance dependencies
fails with a foreign-key conflict.

`initializeStudentClearances(studentId)` creates missing pending records for all
active department categories, including optional ones, in one transaction.
Repeated calls preserve decisions and never create duplicates. Initialization is
explicit rather than a side effect of reading a statement. Statements and progress
still include newly configured mandatory items before records are initialized.

Student decision fields include `status`, nullable `remarks`,
`pending_requirements: string[]`, approval evidence and `updated_by/updated_at`.
Requirements cannot contain null or blank entries. Decision/student/item identities
and creation time are immutable, and cross-department decisions are rejected.

| Stored status | Display label | Blocks overall clearance when mandatory and active |
| --- | --- | --- |
| pending | Pending | Yes |
| cleared | Cleared | No |
| not_applicable | Not Applicable | No |
| rejected | Rejected / Further Action Required | Yes |

`setClearanceStatus(id, status, {remarks?, pending_requirements?})` changes a
decision. An in-charge may reopen a cleared decision to pending or rejected and
resolve it again; approvals are not irrevocable. Rejection needs a nonblank remark
or at least one pending requirement. Cleared/Not Applicable cannot retain pending
requirements; the service clears them when resolving the item. Remarks can remain
as explanatory history. Pending/rejected changes clear approval evidence.

Approval identity, approval time, update identity and timestamps come from the
authenticated database session and server clock. A newly resolved decision is
attributed to its actual in-charge. Same-status metadata edits preserve the original
approval evidence while updating the modifying actor/time. Client timestamps are
never authoritative, and attempts to supply another approver are rejected.
`approveClearance(id, legacyApproverId, status, details?)` remains compatible with
older callers but does not forward the approver argument. Prefer
`setClearanceStatus`; `markClearancePending` also remains available.

## Overall rule and query contracts

`calculate_no_dues_overall(mandatory_total bigint, resolved_total bigint)` is the
reusable, immutable database calculation. Resolved means Cleared or Not Applicable.
It rejects invalid counts and returns:

- `cleared` only when at least one mandatory active category exists and every one
  has a resolved decision.
- `incomplete` if any mandatory active decision is pending/rejected or missing.
- `not_configured` if there are no mandatory active categories; it never silently
  reports clearance for an empty configuration.

`get_no_dues_student_summary` joins the entire active mandatory department template
to student decisions with a left join. Missing rows count in mandatory totals and
in `mandatory_missing`; optional and inactive categories never block. Current
configuration controls the result, so adding or activating a mandatory category
can immediately make an existing student incomplete. Historical decisions for a
previous department do not satisfy the current department checklist.

`getStudentNoDuesStatement(studentId)` calls the student-scoped
`get_student_no_dues_statement` RPC and returns identity, department, graduation
year, `overall_status`, mandatory counts, `snapshot_at`, and `items`. Items contain
all active categories, their flags, remarks, pending requirements and audit fields.
Missing records appear as pending with `is_missing: true`, null decision ID and
null decision audit fields. Overall status always uses the full mandatory set.
Only the student's own identity or an in-charge is authorized. Use this endpoint
for statements; `getStudentClearances` returns only persisted records/history.

`getNoDuesProgress({department_ids: [], graduation_years: []})` calls
`get_no_dues_progress`. Empty arrays mean unrestricted; filters intersect. The
in-charge receives one database snapshot with `totals`, `by_department`, `by_batch`
and `by_department_batch`. Each contains student counts (cleared, incomplete,
not configured), mandatory decision counts (cleared, not applicable, pending,
rejected, missing), and `clearance_rate: {numerator, denominator, percent}`.
The denominator includes unconfigured students; an empty cohort has percent null.
Groups are sorted by department code/ID and graduation year. Missing rows are
separate from persisted pending rows. Category and decision updates immediately
affect fresh progress/statement queries; overall status is never stored or editable.

The earlier Member 3 analytics DTO uses a `pending` overall bucket and
`pending_students`. Its adapter should map workflow `incomplete` to that bucket,
including rejected and missing mandatory items. The new workflow RPCs use
`incomplete` directly and expose `mandatory_rejected` separately; do not drop
rejected records or rely on the older three-status enum list. Updated shared
workflow types and display labels are in `src/features/data/contracts.js`.

Services retain database errors: `42501` forbidden, `23514` invalid decision,
`23505` duplicate record, `23503`/`23001` dependent deletion, `22023` missing
statement identity. RLS-hidden updates affect zero rows, and `.single()` raises
`PGRST116`. Unauthorized users do not learn whether another student's row exists.

## Verification

`npm test` exercises service payload/query contracts, exhaustive overall count
combinations, and SQL workflow/authorization tests in embedded PostgreSQL using
real RLS roles and a minimal Supabase identity shim. The harness applies every
migration in order and substitutes core UUID generation for uuid-ossp.

For a disposable migrated Supabase instance, also run:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/no_dues.sql
```

The fixture rolls back, covers category changes, missing/optional/inactive records,
all decision statuses, approval/timestamp tampering, students' writes, another
student's statement, anonymous access, invalid values, department/batch filters,
empty cohorts, repeat initialization, and dependent deletion. It does not change
live data or apply the migration to a live project.
