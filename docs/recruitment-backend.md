# M2-3 recruitment backend

Apply migrations in filename order. The browser uses the authenticated Supabase
client; never supply a service-role key. `recruitmentService.js` exposes the public
functions; `recruitmentBackend.js` provides the same operations with an injected
client for testing. Existing stage functions remain available.

## Query contracts

`getStudentDrives(studentId)` calls `get_student_drives(p_student_id uuid)` and
returns drive rows ordered by `start_date ASC, id ASC`. Only published, eligible
drives appear. Students can query their own identity; placement in-charge can query
any existing student. Company details can be resolved using `listCompanies()`.

Drive eligibility fields are `department_ids: uuid[]`,
`graduation_years: integer[]` (the batch is the graduation year),
`minimum_cgpa: number|null`, and `maximum_backlogs: integer|null`. Arrays default
to empty (unrestricted); null thresholds are unrestricted. All configured criteria
intersect. Thresholds are inclusive. A missing student CGPA or `backlogs` fails a
configured threshold. Existing students receive unknown/null backlogs rather than
an assumed zero; placement in-charge must populate verified values. Eligibility
freezes when a drive leaves draft. Applying rechecks eligibility under locks;
appearing in the query does not reserve a place or bypass the later check.

`getStudentApplications(studentId)` returns applications with nested drives,
companies and offers, ordered by application time descending. RLS limits students
to their records. `listDriveApplications(driveId)` and
`listApplicationOffers(applicationId)` return authorized rows only. A query for
another student's records returns an empty collection.

`getRecruitmentSuccessCounts(driveId = null)` returns
`{successful_offers, placed_students}`. Count offered/accepted offers on
non-withdrawn applications in published/completed drives only. Placed students
are distinct student IDs. Multiple offers are supported. Counts obey RLS:
in-charge sees the global total; a student sees their own total. This aggregate
does not expose draft or cancelled drive success.

## Writes and transitions

Company: `createCompany(name)`, `updateCompany(id,name)`, `deleteCompany(id)`.
Drive: `createDrive(fields)`, `updateDrive(id,changes)`,
`updateDriveStatus(id,status)`, `deleteDrive(id)`.
Application: `applyToDrive(studentId,driveId)`,
`updateApplicationStatus(id,status)`, `withdrawApplication(id)`,
`deleteApplication(id)`.
Offer: `createOffer(applicationId,{annual_ctc_minor,currency})`,
`updateOffer(id,changes)`, `updateOfferStatus(id,status)`, `deleteOffer(id)`.
Creation returns one persisted row; updates/deletes return the affected row.
Compensation is a nonnegative integer in currency minor units. Currency is three
uppercase letters, default INR. Service allowlists reject unknown payload fields.

| Record | Allowed status transitions |
| --- | --- |
| Drive | draft → published/cancelled; published → completed/cancelled |
| Application | applied → in_progress/selected/rejected/withdrawn; in_progress → selected/rejected/withdrawn; selected → withdrawn |
| Offer | offered → accepted/declined/revoked; accepted → revoked |

Same-status writes are idempotent. New drives/applications/offers start as
draft/applied/offered respectively. Offer issuance requires a selected application
and published/completed drive. Cancelled drives block application status changes
and offer acceptance/decline. Withdrawal makes existing offers unsuccessful;
cancellation does likewise without rewriting historical offer records.

In-charge manages recruitment. Students can create eligible applications for
themselves, withdraw their own nonterminal applications, and accept/decline their
own offered offers. They cannot select themselves, edit compensation, move records
to another parent, or change another student's records. RLS and database triggers
enforce these rules on direct SQL/REST writes as well as service calls. Foreign
identities and creation timestamps are immutable. Row locks serialize eligibility
checks against drive cancellation and offer decisions against withdrawal.

Deletion fails while dependencies exist: company → drives; drive → applications
and stages; student → applications; application → offers and stage results.
In-charge explicitly deletes leaves before parents. No recruitment history is
silently erased by these parent deletes.

Database errors retain their codes: `42501` forbidden, `23514` invalid
eligibility/transition/value, `23505` duplicate application, `23503` dependency
conflict (`23001` for RESTRICT violations on some PostgreSQL versions). RLS-hidden updates/deletes affect zero rows and the service's `.single()`
raises `PGRST116`. Callers must handle this without claiming the record exists.

## Verification

Run `npm test` for service contracts and the SQL suite in embedded PostgreSQL,
using real non-superuser RLS with a minimal Supabase auth shim. The harness uses
core UUID generation in place of uuid-ossp. Run
`psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/recruitment.sql` against
a disposable migrated Supabase database for normal, invalid, ownership, terminal
transition, exclusion and dependency cases. The SQL fixture rolls back all changes.
