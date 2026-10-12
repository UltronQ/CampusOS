# M3-3 placement analytics

Member 3 engine: `src/features/analytics/placementAnalytics.js`. Shared JSDoc contract: `src/features/data/contracts.js` v1.3. Database snapshot: `supabase/migrations/20261012000004_placement_analytics.sql`. Tests: `src/tests/placementAnalytics.test.js`, `placementAnalytics.database.test.js`, fixture `fixtures/placementAnalytics.fixture.js`, and the dashboard cases in `src/tests/browser/studentImport.browser.js`.

Integration edits: `src/services/analyticsService.js` delegates placement directly without a fallback; `src/pages/incharge/Dashboard.jsx` renders the new metrics, trends and refresh; `src/components/dashboard/DashboardFilters.jsx` uses actual stored batches and all drive statuses. `src/app/placementLabels.js` fixes paise-to-rupees display (previously minor units were displayed as whole currency units). Supabase public-key compatibility is in `src/lib/supabaseClient.js` and `.env.example`. No import, no-dues or report engine is added in this phase.

Member 2 dependency: apply the snapshot migration after all existing migrations. It is a read-only, SECURITY INVOKER RPC with explicit authenticated in-charge authorization, an empty search path and RLS. Its single SQL statement assembles a consistent MVCC snapshot and includes no names, email addresses or roll numbers. A scalar JSON result avoids Supabase's default table REST row cap; nothing is silently truncated. It includes both deployed drive-criteria field families, without changing their columns, writes or policies.

## Member 1 API

```js
import { getPlacementAnalytics } from '../features/analytics/placementAnalytics.js';
const stats = await getPlacementAnalytics({
  department_ids: [], graduation_years: [], company_ids: [],
  drive_ids: [], drive_statuses: [], drive_start_from: null, drive_start_to: null,
});
```

The existing dashboard facade `services/analyticsService.getPlacementAnalytics(filters)` preserves `{ source:'member3', data:stats }`. `createPlacementAnalyticsService(getClient)` supports dependency injection in tests. `calculatePlacementAnalytics(snapshot,filters)` is pure and deterministic; it never reads a demo fixture or performs persistence. Filters are validated before querying. Missing/malformed snapshots and database failures reject instead of showing guessed or partial statistics.

## Metric definitions and denominator

The cohort is all stored students matching department AND graduation batch. Company, drive, date and recruitment-status filters constrain recruitment records, not cohort membership. ID arrays are deduplicated and sorted; filters intersect. Empty drive statuses default to published/completed. Selected draft/cancelled drives can appear as zero-outcome companies but never contribute eligible, participating or successful counts.

- `total_students`: distinct students in that cohort, including students without applications.
- `registered_students`: cohort students with the actual boolean `placement_registered=true`; a student account or application alone is not registration. Existing demo records have false until updated/imported with true.
- `eligible_students`: distinct cohort students satisfying stored requirements for at least one scoped published/completed drive, even without an application. Empty year/department criteria impose no restriction. Both `drive_departments`/`eligible_graduation_years`/`min_cgpa`/`max_backlogs` and M2-3 `department_ids`/`graduation_years`/`minimum_cgpa`/`maximum_backlogs` restrictions apply; when both are populated their intersection is used. Unknown CGPA/backlogs fail an explicit threshold. This conservative rule reconciles the two existing field families; Member 2 should align them during future schema consolidation. The manual eligibility flag and registration flag remain separate administrative metrics, consistent with the contracts and existing backend eligibility rules.
- `participating_students`: distinct students with non-withdrawn applications to scoped active drives, including unsuccessful applications. `applications` counts those application records. Application participation does not imply eligibility or placement.
- `successful_offers`: offered/accepted offer IDs joined to selected, non-withdrawn applications, scoped active drives, cohort students and satisfied drive criteria. Declined/revoked offers, rejected applications, draft/cancelled drives and withdrawn applications never succeed.
- `placed_students`: distinct student IDs from successful offers, regardless of the number of offers or companies.
- `unplaced_students`: cohort total minus unique placed students, including nonparticipants and students without usable package data.
- Company `selections`: unique students with eligible selected applications, whether or not an offer exists. `selected_applications` counts records; `placed_students` is distinct successful-offer students; `offers` is valid offer IDs. Company student totals can overlap, so never sum them to derive overall placements.

**Placement percentage = unique placed students / all students in the selected department/batch cohort × 100.** The same denominator rule applies to department and batch summaries. It is explicitly identified by `placement_denominator:'cohort_students'`. Registration and drive eligibility are shown separately. A company filter measures that company's placements against the fixed cohort, allowing comparison without the denominator changing with its applications. A nonempty cohort with no matches has 0%; an empty cohort has null. This is the versioned v1.3 change from the earlier planned eligible-student denominator. All department counts reconcile to overall counts, including students without applications.

The engine uses current stored records/criteria, not a historical point-in-time eligibility archive. Graduation `batch_trends` compare actual cohorts with the same filters and calculations and exist only when at least two stored graduation years are in scope. They are not invented year-over-year snapshots. Actual pre-filter years are returned as `available_graduation_years` for UI options.

## Package statistics

Package statistics are offer-weighted. Only nonnegative safe-integer minor units (numbers or exact database integer strings) enter the calculation. Zero is valid; null, blank, malformed, fractional, negative, nonfinite and unsafe integers are excluded from package statistics without erasing an otherwise valid placement. `excluded_package_offers` reports missing/invalid compensation/currency. The RPC serializes BIGINT compensation as text to avoid precision loss before validation.

`salary` contains INR statistics for the current UI. `salary_by_currency` calculates independent groups; currencies are never mixed or converted. Highest, lowest, mean and median are nullable. No usable package data returns count 0 and null statistics. BigInt sums and rational half-up rounding prevent floating-point sum errors; package mean/median round to integer minor units and percentages to two decimals.

## Live behaviour and tests

The dashboard requests a fresh snapshot when filters change, every 30 seconds, on window focus and on explicit refresh. It discards responses from superseded filter requests and clears results on errors. It polls; it does not require a Supabase Realtime publication. Department charts preserve null rates rather than converting missing data to zero.

Run `npm test`, `node --test tests/*.test.js`, `npm run test:import-ui`, and `npm run build`. All 64 main tests and 8 recruitment tests pass, alongside five browser acceptance groups. Unit tests cover multiple offers, cancelled drives, withdrawn applications, selected students without offers, unplaced students, empty datasets, all filters, eligibility without applications, null academics, currency separation, invalid/unsafe packages, integer rounding, currency-unit display, trends and deterministic ordering. PostgreSQL tests check real stored results, role denial and 1,010 students beyond the default REST cap. Browser tests exercise actual dashboard code over isolated PostgreSQL with test-only Auth transport, filter intersection and manual/focus refresh after changing a registration record. Hosted Supabase JWT/project acceptance still needs real configuration; see [setup](supabase-setup.md).

Short hosted check: apply the migration, sign in as in-charge, view all-student metrics, select each required filter and compare department totals with the overall total. Confirm two offers to one student produce one placed student. Cancel a drive/withdraw an application and refresh to see its offers excluded. Clear package values and confirm the empty package state. A student session must not call the snapshot RPC successfully.

Suggested commit: `feat(analytics): add database-backed placement metrics and live dashboard filters`
