# M2-2 authentication and student services

Implemented on karthikeyas-backend after fast-forwarding the current main foundation. Member 2 owns the services and migration; shared auth, import and contract integration changes preserve Member 1's exported interfaces. No service-role key or real credential is used in browser code.

## Files and ownership

- `supabase/migrations/20251012000004_student_services.sql`: academic/registration fields, trusted student/department validation, secure directory query, configurable import settings, import context/history, and confirmed import RPC.
- `src/services/authSessionService.js`, `authService.js`: Supabase login/logout, server-verified session restoration, profile/student retrieval, supported-role checks and deferred auth-event subscriptions. The pure factory accepts a real client in production and test clients in unit tests.
- `src/services/studentManagementService.js`, `studentService.js`: student CRUD, department CRUD, search/filter/pagination, duplicate lookup, import persistence/history. `studentsService.js` preserves Member 1's existing imports by re-exporting the same implementation.
- `src/services/serviceError.js`: Error objects with stable `code`, human-readable `message`, and optional `backend_code`.
- `src/hooks/useAuth.jsx`: clears stale role state during session changes and ignores out-of-order profile responses.
- `src/features/data/contracts.js`: v1.2 import confirmation/options, row outcomes and counts. `ImportStudents.jsx` sends confirmation only after the preview commit click and renders backend counts/row diagnostics. `StudentForm.jsx` converts retrieved numeric CGPA to text for editing.
- `src/tests/studentServices*.test.js`, `src/tests/helpers/database.js`: service/auth boundary tests and real PostgreSQL migration, validation, import and RLS checks.

## Database setup

Apply migration 00004 after migrations 00001–00003. No existing migration or record is rewritten. Existing academic fields remain null; `placement_registered` defaults false and `eligibility_status` defaults pending. These are administrative record fields; drive criteria remain the thresholds and department/year selections agreed in phase one. Do not equate the manual eligibility flag with computed drive eligibility.

Provision demo auth users through Supabase Auth or trusted admin tooling. An authorized in-charge/admin creates their `profiles(id, role)` entries; no browser signup code assigns roles. Link `students.user_id` only to an existing profile whose role is student. Students cannot edit their role, registration, eligibility, department or other student records. Only in-charge RLS permits student/department writes. Run the documented synthetic seed only on a development database.

Department codes are trimmed/uppercased and unique; names are nonempty. Student roll numbers and names are trimmed, emails lowercased/case-insensitively unique, CGPA constrained to 0–10, backlogs nonnegative integers, academic_year null or 1–8, and phone null or 7–15 digits with permitted punctuation. Program/section are nullable because the original import schema does not provide them. DB validation applies to direct table writes as well as service calls. Dependency-aware deletes remain enforced by migration 00003.

## Member 1 service signatures

- `signInWithPassword(email, password)` -> `{session, profile, role}`. Unknown/unprovisioned roles are rejected and the Auth session is signed out. `signOut()` -> void; failures are reported.
- `getSession()` -> verified session or null; `getRoleSession()` -> `{session, profile, role, student}`; `getStudentRecord()` -> own linked student or null.
- `listStudents(filters)` -> student array (existing UI shape). `searchStudents(filters)` -> `{students, total, offset, limit}` for pagination. Filters: q, department_id, batch/graduation_year, registered boolean or true/false string, eligibility, offset, limit (1–1000). Search is literal, parameterized, case-insensitive roll/name/email matching; special characters cannot inject query syntax. Total includes only RLS-authorized matches.
- `createStudent(payload)`, `updateStudent(id, patch)`, `getStudentById(id)`, `deleteStudent(id)` use one student record and the aliased department join. Supported fields include backlogs, program, academic_year, section, placement_registered, eligibility_status and user_id. No upserts. A denied/nonexistent delete is not reported as success.
- `listDepartments()`, `createDepartment({code,name})`, `updateDepartment(id, patch)`, `deleteDepartment(id)`.
- `fetchImportContext()` -> complete authorized departments/existing identities and database-configured year/row limits, without a silent 1000-row REST truncation.
- `findExistingStudentNumbers(textNumbers)` -> existing authorized identities for at most 1000 candidate numbers. Original zeroes are preserved.
- `listImportHistory({offset,limit})` -> in-charge-visible summaries. Clients cannot insert/update/delete audit rows.

## Member 3 import handoff

Parsing and preview stay in Member 3's `src/features/import/studentImport.js`, now implemented by [M3-2](m3-2-student-import.md). Validation/preview never persists records. The import page provides both file formats, row errors, partial-mode previews and explicit confirmation.

After explicit user confirmation:

```js
const result = await commitStudentImport(preview, { confirmed: true });
// For a caller offering an explicitly confirmed partial import:
const result2 = await importStudentRows(rows, { confirmed: true, mode: 'partial' });
```

Each row is `{source_row: 2, student: {student_number, full_name, email, department_code, graduation_year, cgpa, phone, backlogs}}`. Optional supported extensions are program, academic_year, section, placement_registered and eligibility_status. Never supply user_id, id, role or timestamps through imports. Full required strings and explicit valid source row numbers are mandatory. Duplicate source row numbers, invalid top-level structure, empty/oversized requests and missing confirmation fail before persistence. DB settings default to graduation years 2026–2030 and max_rows=1000; an authorized in-charge can change settings in the trusted database.

`commit_student_import(p_rows, p_confirmed, p_mode)` uses SECURITY DEFINER with a fixed empty search_path and explicit caller-role checks. Only authenticated callers can execute; students/unprovisioned callers are rejected by the function. Unique database constraints handle concurrent identity conflicts. Department lookup is validated and locked while importing. Unsupported fields, malformed emails, missing/numeric roll numbers and out-of-range values are not accepted. No upsert/overwrite exists.

Modes and deterministic outcomes:

- **atomic (default/current UI):** every row succeeds, or all inserts roll back. Invalid/duplicate rows are failed; otherwise-valid rows are skipped with ATOMIC_ABORTED. `successful_count=inserted_count=0` on rejection.
- **partial (explicit opt-in):** valid rows succeed; duplicates are skipped; invalid rows fail. Every member of an uploaded duplicate roll/email group is skipped, so no arbitrary first row wins.
- In both modes `successful_count + skipped_count + failed_count = total_count`. `duplicate_count` is a subset of failed/skipped outcomes, never an additional count. `committed` means at least one row was actually inserted. `students` contains only inserted IDs; atomic rejection contains none.
- `row_results` has source_row, successful/skipped/failed status, inserted student_id if any, and error details. Top-level `errors` includes source_row, code, field and message. Expected codes include INVALID_RECORD, DUPLICATE_STUDENT_NUMBER, DUPLICATE_EMAIL, EXISTING_STUDENT_NUMBER and EXISTING_EMAIL. History stores actor/time/counts, not uploaded personal data.

The confirmation boolean is a workflow requirement, not proof of human intent: an authorized in-charge can always make a direct request. The role check and trusted validation remain the security boundary. Retrying an already committed batch never overwrites students; it reports existing identities. Unexpected infrastructure/database failures throw and roll back the request; never invent successful/skipped/failed counts when no reliable response is available.

## Tests and limitations

Local verification: all 30 regression checks passed, including both the phase-one suite and M2-2 tests. The Vite production build passed; its existing large-chunk warning is a later optimization. The working-tree patch passes `git diff --check`.

Run `npm test`, then `npm run build`. SQL tests execute every migration in disposable PostgreSQL/PGlite instances; JWT/auth schema helpers are test-only. They cover in-charge CRUD, normalization, invalid fields, own-student RLS, denied role escalation, department restrictions, literal search/filters/pagination, missing confirmation, unauthorized RPCs, atomic rollback, duplicate groups, partial counts, no overwrites, configured limits and protected history. Auth tests use injected Supabase boundary mocks to verify both roles, failed login/logout, signed-out/mismatched sessions and event/profile races.

Live Supabase login/session refresh and hosted browser acceptance need actual project values and provisioned demo accounts; those are not claimed verified by mock auth tests. M3-2 supplies the parser, file templates and partial-mode UI with isolated browser/database tests. Application mutation hardening and clearance/report services remain their later assigned phases.

Manual integration check: apply migrations, provision one in-charge and two linked students, log in/out as each, create/edit a student and department, reload and filter the directory, attempt cross-student direct requests, then submit a confirmed import through the service/RPC and compare database rows/history to returned counts. Test an invalid atomic batch and an existing-roll partial batch. No external database reset is needed.

Suggested commit: `feat(backend): secure auth student management and confirmed import persistence`
