# Phase-one alignment and verification

Scope: M1-1, M2-1 and M3-1 from the supplied master prompts. Cross-member edits are authorized by the user. No additional user role or unrelated room/event/assignment module is introduced.

## Changes and integration

- Member 1: `/student/drives`, student navigation and a read-only database list with loading, empty and error states. `listStudentDrives()` accepts no caller-selected student ID. There are no application buttons on this page.
- Member 2: additive migration `20251012000003_phase_one_alignment.sql` widens CGPA, adds nullable backlogs and drive eligibility thresholds, creates the department join table and its RLS, protects students/drives from deletion with linked applications, and adds department/company timestamps. The existing company-to-drive RESTRICT foreign key protects companies. Student drive reads are restricted by backend eligibility.
- Member 2 seed: valid UUIDs and a transaction. No invented auth account/profile. Existing in-charge profile supplies approval evidence; absent approver means pending decisions. Seed reruns do not overwrite records.
- Member 3: contract version 1.1 matches the current schema, includes backlogs and the missing DriveStatus typedef, and explicitly distinguishes total cohort students from eligible_students (the placement-rate denominator). Fixtures/docs describe union eligibility and null rates for no eligible students. Parser, analytics and export implementation remains later-phase work.
- Shared: Papa Parse, SheetJS and Recharts runtime dependencies plus PGlite as a development-only PostgreSQL regression-test dependency. Use the committed lockfile with npm ci.

## Setup and short test procedure

1. Run `npm ci`, `npm test`, then `npm run build`.
2. Apply all SQL migrations in filename order on Supabase. For a previously migrated project apply only migration 00003; it preserves existing records.
3. For fresh demonstration data, provision a demo in-charge through Supabase Auth/trusted admin tooling and create its profile before the first seed run. Run `supabase/seed/seed.sql` as the trusted database owner. If there is no in-charge, the seed works but all demo decisions remain pending. To link a student login, set the seeded student's user_id to the real demo auth account ID through authorized tooling.
4. Sign in as a linked student, open `/student/drives`, and check that published/completed eligible drives load. Configure a department, graduation-year, CGPA or backlog restriction and verify exclusion. Sign in as in-charge and verify management access is retained. Test an unlinked student, no matching drives and a backend error.
5. Attempt deletion of a seeded student/drive/company with dependencies: the database must reject it and retain applications/offers. Update a student CGPA to 10.00 and verify persistence; negative backlogs and CGPA >10 must fail.

## Test boundaries and remaining work

Local verification passed: 8 PostgreSQL regression checks and the Vite production build. The build reports only the existing large-chunk warning; no compilation errors. `git diff --check` is clean.

`npm test` runs real PostgreSQL migrations, seed, constraints and RLS in disposable in-memory PGlite databases. Supabase auth tables and JWT helper functions are simulated only in the test harness; production continues to use Supabase Auth. Tests check fresh seeding with/without real profile references, repeat seeding, CGPA/backlog/eligibility bounds, blocked deletes, eligible/anonymous/in-charge reads, own-student scope and denied student drive writes.

Hosted Supabase migrations, real login sessions, browser page acceptance and deployment require a configured project and remain separate verification. Existing broad student application UPDATE permissions are a known later recruitment/security-phase issue; this change supplies a read-only route and does not claim application mutations are production-ready. Import partial-result counts and confirmation belong to M3-2. Clearance aggregation/views, placement analytics, exports, full CRUD screens and final seed minimums belong to subsequent prompts.
