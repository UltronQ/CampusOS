# M3-2 CSV and Excel student import

Implemented on local main using the existing Member 2 backend commit (9fdc604) as a dependency. Local fast-forwarding does not merge the GitHub PR. Apply migrations 00001–00004 to the real Supabase project before using persistence. No new backend migration, fake auth, fake import or AI feature is introduced by M3-2.

## Files and team integration

Member 3 modules in `src/features/import`:
- `fileParsing.js`: Papa Parse CSV and SheetJS XLSX readers, UTF-8/file/size/worksheet checks and physical row numbers.
- `studentValidation.js`: deterministic header, type, format, department and duplicate validation using Member 2 context.
- `importPreview.js`: immutable preview construction and explicit-confirmation persistence boundary; merges local rejections with actual backend outcomes.
- `studentImport.js`: clean public API and workflow factory. It owns no database connection or writes directly to tables.
- `studentTemplates.js`, `sampleRecords.js`: real CSV/XLSX downloadable templates and fictional sample data. No application query uses these samples as a fallback.

Integration edits: `src/pages/incharge/ImportStudents.jsx` lazy-loads the engine, shows physical row errors and selected-mode previews, provides both template downloads and a confirmation dialog, and displays complete outcomes. Shared `contracts.js` describes the new preview fields. `package.json` adds sample regeneration and browser-test scripts; Playwright is development-only.

Member 2 dependency: `studentsService.fetchImportContext()` returns actual departments/existing identities and authoritative year/row limits; `commitStudentImport(preview,{confirmed:true,mode})` calls its insert-only, role-checked PostgreSQL RPC. Member 1's UI continues to own page layout, route guards and interactions; database RLS remains the authority.

## API for Member 1

```js
import { createStudentImportService } from '../features/import/studentImport.js';
import * as backend from '../services/studentsService.js';

const importer = createStudentImportService(backend);
const preview = await importer.previewFile(file, { mode: 'atomic' });
// Show preview.validation.rows and preview.validation.file_errors first.
// Invoke only after the user confirms the displayed file/mode/count:
const result = await importer.confirmImport(preview, { confirmed: true, mode: 'atomic' });
```

Use the same importer instance for preview/confirmation. `mode:'partial'` explicitly opts into importing ready rows only. Changing a mode/file requires a new preview. Issued previews are immutable, cannot be submitted concurrently, and cannot be reused after a completed response. Backend/network errors are shown, never translated into guessed success counts; re-preview/refresh the directory before retrying an uncertain commit.

Lower-level exports are also available: `parseStudentFile(file,limits)`, `validateStudentRows(parsed,context)`, `validateStudentFile(file,context)`, `buildImportPreview(validation,context,{mode})`, `confirmImportPreview(preview,backend,options)`, `getStudentImportTemplate(format,options)` and `downloadImportTemplate(format)`.

## Validation rules

Required exact headers after trimming: student_number, full_name, email, department_code, graduation_year. Optional base headers: cgpa, phone, backlogs. Optional backend extensions: program, academic_year, section, placement_registered, eligibility_status. Duplicate, empty/unknown or missing required headers block both modes. Extra/missing CSV cells invalidate their row. In XLSX, absent optional cells are null; unexpected extra data columns are rejected.

- Roll number is nonempty text, at most 64 characters. Preserve leading zeroes. Numeric Excel roll/phone cells are rejected even if their display format looks like text; missing zeroes cannot be recovered reliably.
- Name is nonempty text, at most 200 characters. Email is trimmed/lowercased and conventionally validated (no deliverability claim), at most 254 characters.
- Department code is uppercase text and must resolve to a real backend department.
- Graduation year is a four-digit whole year inside backend-configured bounds (default 2026–2030).
- CGPA blank -> null; otherwise 0–10 with at most two decimal places. Backlogs blank -> null; otherwise a nonnegative integer of at most nine digits, matching Member 2's import rule.
- Phone blank -> null; otherwise text with 7–15 digits and optional leading +, spaces, hyphens or parentheses.
- Program/section are nullable bounded text; academic_year is null or 1–8; placement_registered is true/false or blank (false); eligibility_status is pending/eligible/ineligible or blank (pending).
- Every member of a duplicate roll-number or normalized-email group is rejected, not just later rows. Existing identities come from Member 2's actual database context and are never upserted.
- CSV is comma-delimited UTF-8 (BOM accepted), with quoting, commas and embedded newlines handled by Papa Parse. Completely blank rows are ignored while physical line numbers are retained. Excel uses actual worksheet row numbers and rejects formulas/error cells. Formula text beginning with = is also rejected in CSV.
- Limit: 5 MiB and backend max_rows (default 1000). Unsupported, corrupt/encrypted or multi-nonempty-sheet files cannot commit. A row-limit abort sets truncated=true, reports only scanned rows and blocks every mode; it is never a silently truncated import.

## Counts, confirmation and persistence

Preview returns total_rows, valid_rows, invalid_rows, duplicate_rows, warning_rows, can_commit and can_commit_partial plus filename/sheet_name/truncated metadata. These are validation results, never claimed as saved records. `buildImportPreview` selects the correct can_commit for the chosen mode.

Atomic mode requires every row to be valid. Partial mode permits a file with ready rows and local rejects, but never ignores file-level structural errors. Neither parsing nor preview invokes persistence. The UI opens a second confirmation dialog identifying the selected file, mode, ready count and excluded count. Cancel closes it without writes.

Only ready rows go to the backend. The RPC revalidates values, department references, caller authorization and uniqueness, including conflicts introduced after preview. Atomic conflicts roll back all submitted inserts; partial conflicts skip existing identities. Database uniqueness prevents overwrites.

The workflow result covers every parsed file row:
- successful_count is actual database inserts, never a preview estimate.
- Local duplicate-only rejects are skipped; other invalid rows are failed. Backend row outcomes are merged by physical source_row.
- successful_count + skipped_count + failed_count = total_count.
- duplicate_count is a subset of rejected/skipped rows, not an extra outcome.
- inserted_count/students/committed/history_id retain the backend persistence meanings.
- backend_counts identifies the submitted-only database audit summary, and local_rejected_count counts rows never sent to the server. Do not compare the full-file total to submitted-only history as if local rejects had been persisted.

## Templates and samples

Actual files in `public/import/` (also served under `/import/`):
- student-template.csv / student-template.xlsx: exact headers and two editable fictional example rows.
- students-valid.csv / students-valid.xlsx: two valid rows for an initial CSE/ECE seed with student numbers 001–005.
- students-invalid.csv / students-invalid.xlsx: six rows with one ready row, a missing roll number, malformed email, a two-member duplicate group, and existing roll 001.

With the initial seed, the invalid sample has 1 ready row and 5 rejects; confirmed partial mode yields 1 successful, 3 skipped and 2 failed, with no overwrite of 001. Samples depend on current database identities: after importing examples, re-uploading correctly reports existing records.

Excel files store roll numbers and phones as text and year/CGPA/backlogs as numbers. Templates are editable single-sheet workbooks with readable headers. Runtime downloads and saved samples are checked by reopening them with the real parser. Regenerate samples with `npm run samples:import` (SheetJS/Papa Parse app code); authoring-only screenshots and inspection sidecars are not deliverables.

## Tests and short acceptance procedure

Run:
```sh
npm test
npm run test:import-ui
npm run build
```

Node tests cover both formats, missing columns, missing roll numbers, malformed emails, normalized duplicates/existing records, optional fields, field bounds, numeric Excel identifiers, formulas/errors, UTF-8/BOM, quoted newlines, sparse rows, invalid files, limits, confirmation and immutable previews. Parser-to-Member-2-to-PostgreSQL tests verify read-only preview, confirmed persistence, partial counts, existing-record detection, no overwrites and atomic rollback after a post-preview conflict.

Local verification completed: all 54 Node tests passed, all four browser acceptance groups passed, and the production build succeeded. Vite reports a non-blocking bundle-size warning for chunks above 500 kB.

GitHub integration also includes the newer frontend/recruitment changes. The recruitment migration tolerates the existing backlog column and preserves phase-one eligible-drive RLS. Trusted-owner demo seeding suspends only the three recruitment lifecycle guards inside its transaction to load historical fixtures, then restores them before commit; a regression assertion verifies restoration. Normal authenticated writes retain all guards. The separate `node --test tests/*.test.js` recruitment suite passes eight tests.

The browser test uses an isolated test-only Auth transport fixture, real production React/service code, and actual PostgreSQL migrations/RPCs in PGlite. It verifies real CSV/XLSX downloads, preview/cancel with zero writes, explicit confirmation with 1 successful/3 skipped/2 failed, and mobile layout without page overflow or runtime errors. On Windows it defaults to installed headless Edge; elsewhere install Chromium with `npx playwright install chromium`, or set PLAYWRIGHT_BROWSER_CHANNEL for an installed browser. No production auth code is bypassed or replaced; live Supabase JWT/login behaviour is not claimed proven by this fixture.

Manual hosted check: apply migrations, configure public Supabase values, sign in as in-charge, download both templates, upload valid/invalid samples, inspect row messages, cancel a confirmation and verify zero inserts, then confirm an atomic or partial import and reload the student directory. Repeat the file and verify existing identities cannot overwrite records. Student sessions must not access import persistence (covered by the backend RLS suite).

Live hosted Supabase/browser acceptance still requires a configured project and real demo accounts. CSV spreadsheet viewers may infer numeric identifiers; use XLSX or text-column import settings to preserve zeroes. Analytics, reports and AI remain outside M3-2.

Suggested commit: `feat(import): add validated CSV XLSX previews and confirmed student imports`
