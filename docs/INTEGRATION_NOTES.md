# CampusOS - Integration Notes (Member 2)

## Database (Supabase)
- Migrations in `supabase/migrations/`: `20251012000001_initial_schema.sql`, `20251012000002_rls_policies.sql`
- Seed in `supabase/seed/seed.sql` (aligns with M3-1 fixtures; includes UUID mapping)
- Enums and constraints match contracts: user_role, application_status, drive_status, offer_status, clearance_status, stage_result_status
- RLS enabled on all tables with policies:
  - In-charge: full access to authorized management tables
  - Students: read own records/apps/results (published only for stage results), limited updates to own apps as needed
  - Authenticated users can read departments/companies/drives/stages/items

## Environment variables (client)
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anon key (never service role)

## Services (src/services)
- `authService.js`: getCurrentUser, getCurrentProfile, isPlacementIncharge, getStudentRecord
- `studentService.js`: listStudents, createStudent, updateStudent, getStudentById
- `recruitmentService.js`: companies/drives/applications/offers/stages
- `clearanceService.js`: clearance items, student clearances, approval (in-charge only; enforced by RLS + app checks)

## Contracts alignment
- All entities map to snake_case as documented in `docs/data-contracts.md`
- Multiple offers supported (no unique student constraint)
- Withdrawn apps and cancelled drives excluded from successful counts (enforced by analytics)
- Clearance overall requires all mandatory items cleared/not_applicable with approval

## Integration points
- Member 1 (Frontend): use services; respect RLS. For approvals, call clearanceService.approveClearance only after verifying in-charge role.
- Member 3 (Import/Analytics/Reports/Testing): seed aligns with fixtures. `src/utils/csvSafety.js` provides basic CSV safety; XLSX export handled by SheetJS.
- Never commit secrets; never expose service role key.

## Test data
- Seed matches fixture IDs (mapped to UUIDs): 5 students, 4 drives (incl cancelled/draft), 8 apps, 8 offers, 5 clearance items, 6 student clearances. In-charge profile id `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`.

## Limitations
- RLS policies are defensive; app should still check roles before mutations
- Student self-approval prevented by RLS/app (approval requires approved_by set to in-charge)
- Seed requires auth.users for profiles/students with user_id; for pure DB tests without auth, some policies depend on auth.uid()
