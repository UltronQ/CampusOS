# Combined local main integration: PRs 7, 9 and 10

All three PR heads are integrated into main with the existing M3-2 import, M3-3 analytics and M3-4 report work. This document records the decisions that supersede older branch handoff notes.

- PR 7 supplies M2-4's configurable no-dues workflow, rejected decisions, trusted approval audit and server statements.
- PR 9 supplies M2-5's stage integrity guards, schema/temporary-table protections, row-query report RPC and backend audit tests.
- PR 10 supplies public publishable-key compatibility and validation of missing/placeholder/privileged configuration values.

Current contracts stay at v1.4. The frontend `studentService` facade retains Member 2's full student management/search/department API and explicit confirmed atomic/partial import workflow. The M2-5 factory also requires explicit confirmation and sends p_confirmed/p_mode. Its conflicting JSONB-only import RPC was removed; the canonical JSONB/BOOLEAN/TEXT signature avoids PostgREST overload ambiguity and retains configured limits, row outcomes and history. Migration 00009 strengthens numeric JSON type validation without replacing previously applied migration history.

Default `supabase/seed/seed.sql` remains the repeatable, non-sensitive demonstration dataset and does not bootstrap authentication/profiles. M2-5's fixed-identity recruitment/audit fixture is preserved as `supabase/seed/backend-audit.test.sql`; only its isolated test imports that file. Tests exercise the current confirmed import contract rather than the superseded single-argument RPC.

`npm test` now executes both src/tests and tests suites. Browser acceptance remains `npm run test:import-ui`; it covers analytics, report exports/printing and imports. Apply every migration in the exact order in [Supabase setup](supabase-setup.md), including 00006/00007/00008/00009. Configuration support does not itself create a Supabase project or populate `.env.local`.

M3-4's seven reports and real CSV/XLSX serializer remain the application reporting API. The three-kind M2-5 `queryReportRecords` endpoint is retained for its existing consumers and verification suite; do not replace the M3-4 page with a serializer scaffold. No student role is added; trusted data-layer authorization remains authoritative.
