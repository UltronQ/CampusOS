# M1-4 no-dues and analytics dashboards

Status: complete against the phase-one-aligned schema. Dashboard figures come from the analytics service boundary (Member 3 module when present, documented snapshot otherwise) — never from counting application rows in the UI, never hardcoded.

## Files created/changed (Member 1)

- src/services/analyticsService.js — dashboard analytics boundary (new)
- src/services/noDuesService.js — clearance workspace reads, overall-status rule, remarks (new)
- src/components/dashboard/DashboardFilters.jsx — shared filter bar emitting contract-shaped filters (new)
- src/components/dashboard/StatCards.jsx — stat card / rate / section / salary primitives (new)
- src/pages/incharge/Dashboard.jsx — placement + no-dues sections with Recharts charts (rewritten)
- src/pages/incharge/NoDues.jsx — configure, decisions, remarks, pending requirements, progress, printable statement (rewritten)
- src/pages/student/Dashboard.jsx — own progress, offers, checklist, overall status, print (rewritten)
- src/pages/student/Clearance.jsx — own checklist with remarks and print (rewritten)
- src/components/ui/StatusBadge.jsx — tone override + mandatory/optional/inactive tones (edited)
- src/app/placementLabels.js — CLEARANCE_OVERALL_LABELS (edited)
- supabase/migrations/20251012000004_clearance_remarks.sql — adds student_clearances.remarks (schema request for Member 2)

Also in this branch update: merged origin/main (phase-one alignment), realigned M1-3 Drives UI to drive_departments + eligible_graduation_years, and removed the superseded migration 20251012000003_drive_metadata_and_eligibility.sql (Member 2's phase_one_alignment migration replaced it).

## Analytics sourcing (Member 3 integration)

analyticsService auto-discovers src/features/analytics/placementAnalytics.js and noDuesAnalytics.js via import.meta.glob:
- When Member 3 commits getPlacementAnalytics/getNoDuesAnalytics, the dashboard calls them directly and each section is badged "analytics service".
- Until then, totals come from a single authorized snapshot applying the contract rules (distinct placed students across offered/accepted offers; withdrawn applications and cancelled/draft drives excluded; salary offer-weighted integer paise with half-up median; clearance requires every active mandatory item cleared/not_applicable with approval evidence; not_configured when no mandatory items). Sections are badged "db snapshot" — visibly not Member 3's module, visibly not hardcoded.
- Snapshot output includes the PlacementAnalyticsOutput v1.1 fields (total_students, eligible_students as the rate denominator, by_department, salary) plus companies outcomes for the chart. When Member 3 lands, the extra companies field is ignored in favour of their contract shape; the chart degrades to the table if absent.

No dashboard figure is computed by counting application rows: placed = distinct students on successful offers; applications counts non-withdrawn rows only as a supplementary metric.

## No-dues rules implemented

- Overall "Cleared" requires at least one active mandatory item AND every such item cleared/not_applicable with approved_by + approved_at evidence; otherwise Pending; no mandatory items -> Not Configured (never Cleared).
- Missing decision rows are counted and displayed as missing requirements, separate from persisted pending decisions.
- Optional and inactive items never block and are shown separately to students.
- Approvals go through Member 2's clearanceService.approveClearance with the signed-in in-charge profile id; students have no UPDATE policy (self-approval impossible at the database).
- Remarks: in-charge edit via migration 0004 column; students read them on their checklist.

## Test procedure

1. Apply migrations in order (00001..00004); npm run dev; sign in as in-charge.
2. Dashboard: without filters, placement rate = distinct placed ÷ eligible; verify a student with two offers counts once; a withdrawn application and a cancelled drive contribute nothing. Company chart reconciles with the department table.
3. Toggle department/batch/company/status chips: figures and charts refetch per change; Clear all restores the unfiltered snapshot; snapshot_at metadata never affects counts.
4. No-Dues: add a mandatory item for a department; students show Pending with a missing requirement; approve one item -> progress moves; approve all -> student shows Cleared and the department cleared count increments. Revert one -> back to Pending.
5. Statement: open a student statement, Print -> browser print preview shows the checklist without app chrome; overall text matches the rule (all mandatory satisfied -> Cleared).
6. As a linked student: dashboard shows own applications/offers only; clearance shows own checklist with remarks; overall shows Cleared only when all mandatory items are approved; direct PATCH to own student_clearances row is rejected by RLS.
7. Unlinked student account: dashboard shows the "no student record" empty state, not an error crash.

## Limitations

- Batch progress on the No-Dues page is an in-page rollup of loaded student rows (display only; totals on the dashboard still come from analytics).
- Snapshot analytics recompute per filter change client-side over authorized rows — fine for demo cohorts; Member 3's SQL/RPC version is the production path.
- Print styling relies on print:hidden utilities; statement tables are simple by design for A4.
- Migration 0004 (remarks) needs Member 2 review before the shared project applies it.

## Suggested commit

feat(frontend): M1-4 no-dues management and analytics dashboards with member-3-ready service boundary
