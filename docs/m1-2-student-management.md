# M1-2 student management interface

Status: UI implemented; Member 2 schema/RPC is supplied by migration 00004. [M3-2](m3-2-student-import.md) supplies parsing, templates, partial-mode confirmation and isolated browser/database acceptance. Live hosted Supabase acceptance remains pending. No fake uploads, no silent overwrites, no optimistic success anywhere.

## Files created/changed (Member 1)

- src/app/config.js — import year bounds, eligibility enum, directory row limit (new)
- src/services/studentsService.js — students/departments CRUD, import context, commit RPC (new)
- src/hooks/useStudents.js — useStudents(filters) + useDepartments() data hooks (new)
- src/components/students/StudentForm.jsx — validated add/edit form (new)
- src/pages/incharge/Students.jsx — directory, filters, CRUD modals, department panel (rewritten)
- src/pages/incharge/ImportStudents.jsx — import wizard (rewritten)
- src/components/ui/StatusBadge.jsx — added registered/not_registered/eligible/ineligible tones (edited)

## Required student fields → data mapping

| M1-2 field | Store column | Notes |
|---|---|---|
| Roll number | students.student_number | text, unique, leading zeroes preserved |
| Name | students.full_name | |
| Department | students.department_id → departments(id, code, name) | FK, resolved from departments table |
| Program | students.program (NEW) | e.g. B.Tech |
| Year | students.academic_year (NEW) | integer 1–8 |
| Section | students.section (NEW) | text |
| Graduation batch | students.graduation_year | integer, bounds from src/app/config.js |
| University email | students.email | lowercase, unique |
| Placement registration status | students.placement_registered (NEW) | boolean |
| Eligibility status | students.eligibility_status (NEW) | 'pending' \| 'eligible' \| 'ineligible' (proposed — confirm enum) |
| (optional, contract v1) cgpa, phone | students.cgpa, students.phone | nullable |

Schema delta implemented by Member 2 migration 00004: program, academic_year, section, placement_registered and eligibility_status. src/services/studentsService.js now re-exports Member 2's shared implementation, retaining the existing UI names and aliased department join.

## For Member 2 — what this UI calls

1. Tables departments(id, code, name) and students as mapped above, with RLS: placement_incharge full write, student read-own only.
2. RPC commit_student_import(p_rows jsonb, p_confirmed boolean, p_mode text default 'atomic') — SECURITY DEFINER, explicitly checks caller role and revalidates values/references/uniqueness. The UI calls commitStudentImport(preview, {confirmed:true}) only on the preview commit click. Atomic rejection inserts zero. Contract v1.2 also returns successful_count, skipped_count, failed_count, duplicate_count, total_count, row_results and history_id, with source-row diagnostics. Explicit partial mode is available to service callers; the current UI stays atomic.
3. Unique constraints: students.student_number, students.email. Conflicts must raise 23505 (the UI maps it to a friendly no-overwrite message).
4. FK students.department_id → departments.id; keep ON DELETE RESTRICT so the directory's delete surfaces linked-record errors instead of orphaning placements.

## For Member 3 — parser contract the UI fulfils

- The import page dynamically imports src/features/import/studentImport.js and calls validateStudentFile(file, context) then buildImportPreview(validation, context), exactly per docs/data-contracts.md. Until that module exists, the page shows an honest "Parser not available yet" error — it never fakes validation.
- context is built by studentsService.fetchImportContext(): { departments:[{id,code}], existing_students:[{id,student_number,email}], min_graduation_year:2026, max_graduation_year:2030, max_rows:1000 }.
- Template download emits header-only CSV of IMPORT_HEADERS (imported read-only from contracts.js).
- Preview table renders ImportRowValidation rows: source_row, normalized values, errors[]/warnings[] with contract codes; file_errors render as a blocking banner; Commit button is disabled unless can_commit.
- Post-commit counts and rejected-row messages come directly from the database response. Atomic rejection marks invalid rows failed and otherwise-valid aborted rows skipped. No client-side estimate is shown as a persistence outcome.

## For Member 1 follow-ups

- Directory fetch limit is 500 rows (DIRECTORY_ROW_LIMIT) — add pagination when cohorts exceed it.
- Batch filter options derive from IMPORT_CONFIG year bounds, not from the data — revisit if cohorts span outside 2026–2030.
- Eligibility/registration write flows are manual-edit only here; a later eligibility-batch-update feature may extend the service.

## Test procedure (needs Member 2 schema; ~10 min)

1. Apply Member 2 migration; npm run dev; sign in as placement in-charge.
2. /incharge/students: empty state appears; "Manage departments" adds CSE/ECE; chips list updates.
3. Add student with missing fields -> inline validation errors, no request fires. Add valid student -> row appears after reload. Re-add same roll number -> red conflict error, original row unchanged (no silent overwrite).
4. Edit the student (change batch/eligibility) -> persisted after refresh. Delete -> confirm dialog; a student with applications is rejected with the linked-records message.
5. Filters: search by partial name/roll/email; department, batch, registration and eligibility selects narrow the table; Clear resets.
6. /incharge/import: download CSV and XLSX templates with current IMPORT_HEADERS (including backlogs) and editable fictional examples. Upload either format and inspect physical row numbers and validation messages. Cancel confirmation and verify zero writes.
7. Upload a file with bad rows -> atomic confirmation is disabled. Fix the file or explicitly choose partial mode -> confirm -> counts reconcile successful, skipped and failed outcomes; the directory lists actual new students. Existing identities are rejected without overwriting. See M3-2 for the reproducible mixed-file acceptance procedure.
8. As student session: /incharge/students redirects to /unauthorized; direct table queries return only own row (RLS).

## Suggested commit

feat(frontend): M1-2 student directory, department management and validated import UI
