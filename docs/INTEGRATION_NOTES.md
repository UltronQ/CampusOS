# CampusOS backend integration

The current integration handoff is [M2-5 backend integration, integrity and security](backend-integration-handoff.md).

Apply every migration in `supabase/migrations` in filename order, committing the clearance enum addition before the workflow migration. The default `supabase/seed/seed.sql` remains insert-only and repeatable without creating Auth users/profiles. The separate `backend-audit.test.sql` fixture is used only by M2-5's isolated audit tests and requires their three test identities.

Member 1 keeps the existing auth/session boundary. Student, recruitment and clearance service exports remain available. Students can read only their own private records, withdraw their own eligible applications, and respond to their own offered offers; every privileged operation is guarded by RLS or trusted database validation.

Member 3 calls `studentService.commitStudentImport(preview, {confirmed:true, mode:'atomic'})` (or explicit partial mode) for revalidated insertion and audit counts. M3-3 analytics and M3-4 report/file engines are implemented. `reportService.queryReportRecords(input)` remains available for the three M2-5 row-query kinds; the seven mandatory reports use M3-4's authorized snapshot service. See [combined integration](merged-pr-integration.md). No-dues workflow status is `incomplete` for unresolved mandatory items; the older dashboard pending bucket remains its compatibility mapping.

Run `npm test`, `npm run test:integration`, and `npm run build`. The tests execute migrations, the actual seed, real database RLS roles, service/RPC contracts and normal/invalid/unauthorized scenarios. They use an embedded PostgreSQL Auth shim, not live Supabase JWT/PostgREST sessions. Human contract acknowledgement from Members 1 and 3 remains pending.

The browser uses `VITE_SUPABASE_URL` and a public publishable key or legacy anon key. Placeholder URLs/keys and privileged keys are rejected. Authorization never comes from route visibility or client-supplied roles.
