# M1-1 frontend foundation and routing

Status: phase-one foundation implemented; live Supabase/browser acceptance is pending. React 19 + Vite 7 + Tailwind CSS v4 + React Router 7 + Supabase JS v2. No page fabricates data. `/student/drives` is database-backed and read-only; later module pages remain scaffolds.

## Files created (Member 1 territory)

Root: package.json, vite.config.js, index.html, .gitignore, .env.example.
App: src/main.jsx, src/app/App.jsx, src/app/router.jsx, src/app/navigation.js, src/index.css.
Auth: src/lib/supabaseClient.js, src/services/authService.js, src/hooks/useAuth.jsx, src/components/auth/ProtectedRoute.jsx.
UI kit: src/components/ui/{Button,DataTable,FormField,Modal,ConfirmDialog,StatusBadge,States}.jsx.
Layout: src/components/layout/AppShell.jsx, src/components/layout/ModulePage.jsx.
Pages: src/pages/{SignIn,NotFound,Unauthorized}.jsx, src/pages/incharge/{Dashboard,Students,ImportStudents,Companies,Drives,Applications,Analytics,NoDues,Reports}.jsx, src/pages/student/{Dashboard,Drives,Applications,Offers,Clearance}.jsx.

Original M1-1 work preserved Members 2/3 files. The later phase-one correction is explicitly authorized across all three members and aligns routing, schema and contracts.

## Routes

| Path | Access | Module |
|---|---|---|
| /signin | public | auth |
| /incharge/dashboard | placement_incharge | overview |
| /incharge/students | placement_incharge | 1 student/department management |
| /incharge/import | placement_incharge | 1 validated CSV/XLSX import |
| /incharge/companies, /incharge/drives | placement_incharge | 2 company & drive management |
| /incharge/applications | placement_incharge | 3 applications, stages, offers |
| /incharge/analytics | placement_incharge | 4 live placement analytics |
| /incharge/no-dues | placement_incharge | 5 no-dues checklists & approvals |
| /incharge/reports | placement_incharge | 6 statements & exports |
| /student/dashboard, /student/applications, /student/offers, /student/clearance | student | own records, stages, offers, clearance |
| /student/drives | student | read-only list scoped by backend eligibility |
| /unauthorized | signed-in, wrong role | — |
| * | anyone | 404 |

Unauthenticated access to any protected route redirects to /signin preserving the intended path; after sign-in the user returns to it only when their backend role owns that area.

## Integration contract with Member 2 (confirm/adjust, then tell Member 1)

1. Table public.profiles(id uuid PK references auth.users.id, role text check in ('placement_incharge','student')). Exactly the two roles from src/features/data/contracts.js USER_ROLES; no third role.
2. RLS: students read own profile/records/published results; in-charge reads/writes authorized records; profiles rows readable by the owning user. Frontend role gating is cosmetic — RLS is the authorization.
3. Auth flow: email+password via supabase.auth; profile row created by backend provisioning (trigger or in-charge action). If no profile row exists, UI shows "Account not provisioned", never a default role.
4. Env: only VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the browser bundle. Service-role key stays server-side. .env.example documents this.
5. If Member 2's schema changes, coordinate the relevant service boundary; keep exactly two roles unless the Problem Statement PDF requires another. The useAuth() shape (session, user, profile, role, loading, error, signIn, signOut, refreshProfile, isPlacementIncharge, isStudent) stays stable.
6. `listStudentDrives()` uses the shared Supabase client. Migration 00003 enforces department/year/CGPA/backlog eligibility and published/completed visibility for the authenticated caller. The page provides loading, error and empty states and no mutation controls.

## Integration points with Member 3

- Import: /incharge/import will call validateStudentFile(file, context) then render preview/errors with DataTable/StatusBadge, and call Member 2 commitStudentImport only when can_commit.
- Analytics: /incharge/analytics and /incharge/dashboard call getPlacementAnalytics/getNoDuesAnalytics; filters rendered with FormField; numbers rendered as returned, never recomputed; Recharts consumes by_department.
- Reports: /incharge/reports builds ReportExportInput, calls exportReport, then object-URL download of the returned Blob using its filename.
- Errors: service rejections (DataFeatureError-shaped) render in ErrorState; no alert().

## Reusable UI kit

DataTable (columns/rows/rowKey/empty state, sr-only caption), Modal (focus move-in, Escape, backdrop, scroll lock, focus restore), ConfirmDialog (destructive actions; caller performs service call), Button (primary/secondary/danger/ghost + busy), FormField (label+error wired via aria-describedby, input/select/textarea), StatusBadge (all contract enums), States (LoadingState/EmptyState/ErrorState/UnauthorizedState). AppShell: desktop sidebar, mobile drawer, skip-to-content link, real sign-out.

## Verification performed

- npm install: exit 0 (55 top-level packages).
- npm run build: exit 0, dist emitted (506 kB JS / 22.7 kB CSS; chunk-size warning noted — code-splitting is a later optimization, not a blocker).
- npm run preview: GET / -> 200; GET /signin -> index.html SPA fallback with title CampusOS; assets served.
- Authorization behavior (redirects, role gating, RLS) requires a live Supabase project — covered by the checklist below, not yet executed.

## Smoke-test checklist (manual, ~10 min, needs Member 2 schema + seeded users)

1. npm install; cp .env.example .env.local with real project values; npm run dev.
2. Signed out: visit /incharge/dashboard and /student/dashboard -> redirected to /signin; back-button does not expose protected UI.
3. Sign in with wrong password -> error state, no navigation. Missing env -> configuration error on sign-in page, no crash.
4. Sign in as a linked student -> lands on /student/dashboard; sidebar shows only the 5 student items; visiting /incharge/students lands on /unauthorized. Open /student/drives and verify matching published/completed drives, hidden draft/cancelled/ineligible drives, and loading/error/empty states.
5. Visit /incharge/analytics directly as student -> /unauthorized. Sign in as in-charge -> lands on /incharge/dashboard with the 9 in-charge items.
6. User with auth account but no profiles row -> "Account not provisioned" state, no default role assumed.
7. Keyboard: Tab through sign-in and shell; skip-to-content link appears on first Tab; Escape closes modal/drawer; dialog focus returns to trigger.
8. Mobile (<=1024px): hamburger opens drawer, nav closes drawer, backdrop click closes it; tables scroll horizontally without breaking layout.
9. Sign out -> session cleared; direct URL access to previous page redirects to /signin.
10. Supabase dashboard: confirm no service-role key in dist/ (search dist/assets for "service_role" -> zero matches).

## Suggested commit

feat(frontend): M1-1 app shell, auth foundation, role-based routing and UI kit
