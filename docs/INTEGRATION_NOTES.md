# CampusOS - Integration Notes (Member 2)

## Database (Supabase)
- Apply all migrations in filename order, including `20251012000003_phase_one_alignment.sql`. Previously migrated databases need only the new migration; do not reset their data.
- Seed in `supabase/seed/seed.sql` (aligns with M3-1 fixtures; includes UUID mapping)
- Enums and constraints match contracts: user_role, application_status, drive_status, offer_status, clearance_status, stage_result_status
- RLS enabled on all tables with policies:
  - In-charge: full access to authorized management tables
  - Students: read own records/apps/results (published only for stage results), limited updates to own apps as needed
  - Authenticated users can read departments/companies/stages/items
  - Students read only published/completed drives matching their linked student record; eligibility is enforced by RLS, not UI filtering
  - In-charge retains management access to all drives

## Environment variables (client)
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anon key (never service role)

## Merge resolution with main (M1-1 frontend)
Member 1's frontend foundation landed on `main` first and created two of the same files. Resolved as follows (no Member 1 API was removed):
- `src/lib/supabaseClient.js` — kept Member 1's lazy client (`getSupabase()`, `isSupabaseConfigured()`). There is no `supabase` const export; every Member 2 service calls `getSupabase()`.
- `src/services/authService.js` — one file, two ownership areas: Member 1 keeps `getSession`, `signInWithPassword`, `signOut`, `onAuthStateChange`, `fetchProfile` (used by `src/hooks/useAuth.jsx`); Member 2 added `getCurrentUser`, `getCurrentProfile`, `isPlacementIncharge`, `getStudentRecord` on the same client.
- Member 2's `studentService.js`, `recruitmentService.js` and `clearanceService.js` were updated to `getSupabase()` so they work against Member 1's client.

## Services (src/services)
- `authService.js`: shared — Member 1 session boundary plus Member 2 helpers (getCurrentUser, getCurrentProfile, isPlacementIncharge, getStudentRecord)
- `studentService.js`: listStudents, createStudent, updateStudent, getStudentById
- `recruitmentService.js`: companies/drives/applications/offers/stages; `listStudentDrives()` supplies the read-only `/student/drives` page without accepting a student ID
- `clearanceService.js`: clearance items, student clearances, approval (in-charge only; enforced by RLS + app checks)

## Contracts alignment
- All entities map to snake_case as documented in `docs/data-contracts.md`
- Multiple offers supported (no unique student constraint)
- CGPA accepts 10.00; backlogs is a nullable nonnegative integer (null = unknown)
- Drive criteria: `eligible_graduation_years`, `min_cgpa`, `max_backlogs`, `application_deadline`, and the `drive_departments` join table
- Empty drive years/departments mean unrestricted; configured thresholds exclude unknown student values
- Students/drives with linked applications cannot be deleted; companies with linked drives cannot be deleted
- Contract v1.1 has `eligible_students` as the future analytics placement-rate denominator; the cohort remains `total_students`
- Withdrawn apps and cancelled drives must be excluded from successful counts by the later analytics implementation
- Clearance overall requires all mandatory items cleared/not_applicable with approval

## Integration points
- Member 1 (Frontend): use services; respect RLS. For approvals, call clearanceService.approveClearance only after verifying in-charge role.
- Member 3 (Import/Analytics/Reports/Testing): seed aligns with fixtures. `src/utils/csvSafety.js` provides basic CSV safety; XLSX export handled by SheetJS.
- Never commit secrets; never expose service role key.

## Test data
- Seed matches fixture IDs (mapped to valid UUIDs): 5 students, 4 drives (incl cancelled/draft), 8 apps, 8 offers, 5 clearance items, 6 student clearances. Offers use the `f100...` prefix, checklist items `b100...`, decisions `c100...`.
- The seed never inserts auth users or changes roles. Provision a demo auth account through Supabase Auth and create its in-charge profile through trusted admin tooling before the first seed run to reproduce the fixture's approved decisions.
- Without an in-charge profile, the seed still runs: decisions are pending with no approver evidence. It never fabricates approval. Re-running is insert-only and does not overwrite decisions.
- Student `user_id` remains null until an existing demo auth account is linked by an authorized in-charge/admin. Only a linked student can see the read-only drive list. No demo passwords or service-role keys are committed.

## Limitations
- RLS policies are defensive; app should still check roles before mutations
- Student self-approval prevented by RLS/app (approval requires approved_by set to in-charge)
- `npm test` executes migrations/seed and real PostgreSQL constraints/RLS in an isolated PGlite database, with test-only Supabase auth schema and JWT helpers. Hosted login/session and browser end-to-end validation still need a configured Supabase project.
- General application mutation restrictions, import persistence, clearance views, analytics and exports remain later-phase work. Student application UPDATE policies are not yet column/status-limited; do not consider recruitment mutations production-ready.
