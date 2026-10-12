# M1-3 recruitment and placement screens

Status: UI complete against Member 2's merged services and schema. One schema request (migration 0003) needs Member 2 review. No local-state simulation anywhere: every list and write goes through services over RLS-protected tables.

## Files created/changed (Member 1)

- supabase/migrations/20251012000003_drive_metadata_and_eligibility.sql — schema request (see below)
- src/app/placementLabels.js — PDF↔enum label maps, stage preset, CTC helpers
- src/services/driveService.js — Member 1 extension (full drive edit, detailed reads, eligibility, stage sync, outcome updates)
- src/hooks/usePlacement.js — useCompanies/useDrives/useApplications/useStudentApplications + useAsyncData
- src/pages/incharge/Companies.jsx — real company list + create
- src/pages/incharge/Drives.jsx — drive list, status filter, create/edit modal (metadata, eligibility targeting, stages editor), quick status change
- src/pages/incharge/Applications.jsx — registered students, stage-result publishing, outcomes, offer record/revoke, register-student modal
- src/pages/student/Applications.jsx — own history, registered companies, eligibility card, published stage pipeline
- src/pages/student/Offers.jsx — own offers table

Member 2's files were not modified; recruitmentService and authService are used as published in INTEGRATION_NOTES.md.

## PDF status mapping (stored enum → PDF label)

Drive status (enum from migration 0001 + new 0003 value):
- draft → Planned, published → Open, in_progress → In Progress (new), completed → Completed, cancelled → Cancelled

Application status (enum from 0001 + new 0003 value):
- applied → Registered, in_progress → In Progress, selected → Selected, joined → Joined (new), rejected → Rejected, withdrawn → Withdrawn
- "Offer Received" is not an application status: it is derived in the UI (and in analytics) from an offers row with status offered/accepted.

The ten-stage PDF pipeline splits across the model on purpose: Registered…Interview in Progress are recruitment_stages per drive (editable in the drive form, with a one-click PDF default preset); Selected/Joined/Rejected/Withdrawn are application outcomes; Offer Received is the offers table. This keeps Member 2's schema and the M3-1 contracts intact while presenting the PDF's language.

## Migration 0003 request (Member 2 must review/apply)

- ALTER TYPE drive_status ADD VALUE 'in_progress'; ALTER TYPE application_status ADD VALUE 'joined' (PG12+ allows in-transaction).
- drives: criteria TEXT, application_deadline DATE, job_location TEXT, annual_ctc_minor INTEGER (CHECK >= 0), currency TEXT DEFAULT 'INR' — the PDF's criteria/deadline/location/package fields.
- drive_eligibility(drive_id, department_id, graduation_year NULL = all batches) with unique constraint + RLS mirroring migration 0002 style.
Non-destructive, idempotent (IF NOT EXISTS everywhere). Until applied: reads degrade (empty eligibility, null metadata) and eligibility writes surface a clear "apply migration 20251012000003" error from driveService — never a silent success.

## Security notes

- Students never see unpublished stage results: RLS filters application_stage_results (published_at IS NOT NULL + own application); the UI additionally renders only what the query returns.
- Students read only own applications/offers (RLS get_student_id()); the screens send no student_id from the browser except the signed-in record resolved server-side via authService.getStudentRecord().
- Eligibility computation in the UI (isStudentEligibleForDrive) is display-only; applyToDrive does not revalidate eligibility server-side — Member 2 should add a trigger/RPC check before production (documented gap).
- RLS currently lets any authenticated user read draft drives and stages (migration 0002 policy). The student screens filter to published/completed drives in the UI, but hardening the policy to status <> 'draft' is a Member 2 item.
- Students have SELECT-only on offers; accept/decline is recorded by the in-charge (updateOfferStatus). If self-acceptance is required by the PDF, Member 2 must add a student UPDATE policy limited to status in ('declined') with RLS checks.

## Test procedure (needs applied schema + seed + two auth sessions)

1. In-charge: add company; create drive "Open" with PDF preset stages, deadline, location, ₹6,00,000 package, CSE + 2027 eligibility; verify row + status quick-change to In Progress.
2. Register student to the drive; verify appears in Applications with company/drive context.
3. Publish stage results (Shortlisted → passed, Assessment → failed); switch to student session: results visible only after publish; unselected stages show no result.
4. Set outcome Selected; record ₹6,00,000 offer; student sees "Offer Received" badge on the application and the offer row with formatted CTC. Revoke offer from in-charge; student sees revoked badge.
5. Set outcome Rejected/Withdrawn on another application; confirm analytics later exclude withdrawn.
6. Student session: cannot open /incharge/* (redirects); direct Supabase queries return only own rows; another student's application id returns empty.
7. Without migration 0003: drive form saves core fields, eligibility save errors with the migration hint — no fake success.

## Suggested commit

feat(frontend): M1-3 recruitment drives, applications, stage controls and student placement screens
