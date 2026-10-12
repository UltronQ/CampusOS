# Connect CampusOS to Supabase

The local repository currently has `.env.example` only. It is a template, not configuration. No real Supabase project URL/public key or provisioned demo accounts have been supplied. Unit/database/browser fixtures use isolated test transport and PostgreSQL; they do not create a hosted project. Git ignores `.env.local`, so teammates each configure it locally.

## 1. Obtain your project values

Use the team's existing Supabase project if one exists; otherwise create a development project in the Supabase dashboard. Open its Connect dialog for the Project URL and public key, or use Settings > API Keys. Use a publishable key (`sb_publishable_...`) or the legacy anon key. The browser must never receive a secret/service-role key. See [official API key guide](https://supabase.com/docs/guides/getting-started/api-keys) and [React setup](https://supabase.com/docs/guides/getting-started/quickstarts/reactjs).

## 2. Configure the actual app folder

Create `C:\Users\Mohan\Desktop\CampusOS\CampusOS\.env.local` alongside package.json:

```dotenv
VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR-PUBLIC-PUBLISHABLE-KEY
```

For a legacy project, replace the second variable with `VITE_SUPABASE_ANON_KEY=YOUR-ANON-KEY`. Existing anon-key configuration remains supported; when both exist the publishable key takes precedence. Use actual values, not these placeholders. Restart `npm run dev` after saving; Vite loads environment variables at startup. Vercel requires the same public variables in project environment settings followed by redeployment.

## 3. Apply database migrations

For a fresh development database, run each SQL file in the Supabase SQL Editor in this exact order:

1. `supabase/migrations/20251012000001_initial_schema.sql`
2. `supabase/migrations/20251012000002_rls_policies.sql`
3. `supabase/migrations/20251012000003_phase_one_alignment.sql`
4. `supabase/migrations/20251012000004_clearance_remarks.sql`
5. `supabase/migrations/20251012000004_student_services.sql`
6. `supabase/migrations/20261012000003_recruitment.sql`
7. `supabase/migrations/20261012000004_clearance_status.sql`
8. `supabase/migrations/20261012000004_placement_analytics.sql`
9. `supabase/migrations/20261012000005_no_dues_workflow.sql`
10. `supabase/migrations/20261012000006_backend_integrity.sql`
11. `supabase/migrations/20261012000007_report_queries.sql`
12. `supabase/migrations/20261012000008_m3_report_snapshot.sql`
13. `supabase/migrations/20261012000009_import_contract_alignment.sql`

For an existing project, Member 2 should first check which migrations are already applied and run only missing files; these schema migrations are not intended for repeated execution. There are files sharing versions `20251012000004` and `20261012000004`, so the SQL Editor sequence above avoids treating each pair as a single CLI migration. Coordinate unique versions/history with Member 2 before using automated `supabase db push`; do not rename previously applied migrations blindly. Do not reset a shared database to configure a local preview.

## 4. Create real demo logins and roles

Create a password-based demo user under Authentication > Users. Copy its UUID. In the trusted SQL Editor, insert the matching profile (replace the placeholder UUID):

```sql
INSERT INTO public.profiles (id, role)
VALUES ('AUTH-USER-UUID'::uuid, 'placement_incharge');
```

The first in-charge profile must be provisioned in this trusted environment; the browser cannot assign itself a role. Creating an Auth user alone is insufficient: CampusOS rejects users without a supported profile. Use only `placement_incharge` or `student`.

For a student login, create another real Auth user, insert `profiles(id,role)` with role `student`, and link that UUID to the correct `students.user_id` using the trusted SQL Editor or permitted in-charge service. Do not paste password/key material into repository files. The compact `supabase/seed/seed.sql` is a five-student regression fixture. For the separate 30-student hosted demo, follow [M3-5 seed and acceptance instructions](m3-5-seed-acceptance.md): first confirm the intended development project, complete migration/API schema checks and configure ignored `.env.seed.local`; then run `npm run seed:demo` with trusted tooling. It provisions four real demo Auth accounts (one placement_incharge, three student), applies the idempotent fake-data seed and links three student identities. Never use it on production. No hosted seed is run automatically.

## 5. Verify

Open the local app and sign in using the newly created password account. Confirm the appropriate role route loads, create a student or import a template, reload the directory and verify persistence. The placement dashboard requires the new snapshot RPC migration. The compact regression seed shows 5 cohort students, 2 unique placed students, 3 valid offers, 40% placement and 0 placement-registered students. The M3-5 demo seed is separate: 30 students, 4 uniquely placed, 5 successful offers and 13.33% placement. Registration and outcomes in either fixture are synthetic. See [M3-5 validation results](test-results/m3-5.md) for current hosted limitations; do not claim demo readiness while any gate is blocked.

Check errors by their cause: “not configured” -> missing env values/restart; invalid key or connection error -> wrong public key/project URL; unprovisioned profile -> missing matching role record; missing relation/column/RPC -> unapplied migration. Verify student sessions cannot access in-charge import or placement analytics RPCs. RLS remains enabled.
