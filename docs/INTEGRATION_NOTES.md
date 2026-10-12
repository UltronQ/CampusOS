# CampusOS backend integration

The current integration handoff is [M2-5 backend integration, integrity and security](backend-integration-handoff.md).

Apply every migration in `supabase/migrations` in filename order, committing the clearance enum addition before the workflow migration. The development seed is now executable, uses valid UUIDs and follows recruitment transitions; it requires three documented disposable Auth identities.

Member 1 keeps the existing auth/session boundary. Student, recruitment and clearance service exports remain available. Students can read only their own private records, withdraw their own eligible applications, and respond to their own offered offers; every privileged operation is guarded by RLS or trusted database validation.

Member 3 can call `studentService.commitStudentImport(preview)` for atomic, revalidated insertion and `reportService.queryReportRecords(input)` for filtered, typed snapshot rows. Spreadsheet parsing, analytics rendering and CSV/XLSX file exports remain consumer work. No-dues workflow status is `incomplete` for unresolved mandatory items; map it explicitly to the older analytics pending bucket.

Run `npm test`, `npm run test:integration`, and `npm run build`. The tests execute migrations, the actual seed, real database RLS roles, service/RPC contracts and normal/invalid/unauthorized scenarios. They use an embedded PostgreSQL Auth shim, not live Supabase JWT/PostgREST sessions. Human contract acknowledgement from Members 1 and 3 remains pending.

The browser uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; authorization never comes from route visibility or client-supplied roles.
