# M3-5 seed data and acceptance tests

Member 3 deliverable for deterministic fake data, repeatable database acceptance, and demo handoff. The fixture is generated from `src/tests/fixtures/demoData.js`; it contains fictional data only.

## Contents and safe use

- `src/tests/fixtures/demoData.js`: stable UUIDs and four demo account identities: one `placement_incharge` and three `student` accounts. The only supported roles remain `placement_incharge` and `student`.
- `scripts/demo/generateDemoSeed.js` writes `supabase/seed/demo.seed.sql`; `npm run samples:demo` regenerates it and makes no database changes.
- `scripts/demo/provisionDemo.js` is trusted Node-only provisioning. `npm run seed:demo` creates or reuses the four real Auth accounts, checks profile role and database project identity, runs the SQL seed, then links the three student accounts. It never replaces an existing password, conflicting role, or conflicting student link.
- `.env.seed.example` documents the ignored `.env.seed.local` settings. Service role and database-owner credentials stay in that local file and are never used by the frontend or written to test results.
- `scripts/demo/checkDemoLogins.js` checks password sign-in, session restore, role, student linkage, logout and invalid-password rejection for every manifest account. `npm run test:demo-logins` records per-account results in `docs/test-results/m3-5-hosted-logins.json` without passwords or tokens.

Apply every current migration to the intended development project before provisioning. The seed requires a real in-charge profile and appropriate database-owner privileges. Run it only on a dedicated development/demo project. It is idempotent for its stable IDs and uses `ON CONFLICT DO NOTHING`; existing rows are not overwritten. Its documented aggregate expectations assume the demo project has no conflicting CampusOS data. Never run it against production data. It does not reset or delete unrelated rows.

The seed contains 3 departments, 30 students split evenly across CSE/ECE/ME, 5 drives across published/completed/draft/cancelled states, 12 applications, 9 offers with declined/revoked and multiple-offer cases, and varied mandatory/optional/inactive, pending/rejected/cleared/not-applicable/missing no-dues states. Ten ME students have no active mandatory clearances and must be `not_configured`, not shown as cleared. Four students have a successful placement outcome; one has multiple qualifying offers. Withdrawn applications, cancelled drives, declined and revoked offers are excluded by the analytics rules.

The older `supabase/seed/seed.sql` remains a compact five-student regression fixture for M2-5/M3-1 tests. It is not the 30-student demo seed. See [fixture specification](data-fixture-specifications.md) for its separate expected values.

## Acceptance test IDs and expected results

These stable IDs let Members 1, 2 and 3 refer to the same scenario in review. Executable cases are in `src/tests/demoAcceptance.test.js` unless a file is listed.

| ID | Scenario / owner boundary | Expected result |
| --- | --- | --- |
| M35-SEED-01 | Seed guard and auth boundary (M3-5 + M2 schema) | Seed fails without an in-charge profile; creates no Auth users or profiles itself. |
| M35-SEED-02 | Repeatable fixture | Exactly 3 departments, 30 students and 5 drives; rerun preserves counts, stable student login links, and original trigger states. |
| M35-AN-01 | Analytics totals (M3-3 + M2 snapshot) | Cohort denominator 30; 24 registered; 30 eligible; 9 participating; 10 active applications; 4 uniquely placed; 26 unplaced; 5 successful offers; 1 multiple-offer student; placement rate 4/30 = 13.33%. Four valid salary observations; max 120,000,000 minor units, mean 90,000,000. |
| M35-AN-02 | Filter and exclusion behavior (M3-3 + M2 query) | CSE rate 20%; 2027 cohort has 15 students, 2 placed and 3 offers; cancelled-drive scope has 0 offers and denominator 30; department/company/status filters intersect. Withdrawn/cancelled/declined/revoked records do not create placements. |
| M35-CRUD-01 | Student CRUD persistence (M2 service/schema) | Insert/update is visible on a later read; unlinked student may be deleted; malformed email and unauthorized student write fail. |
| M35-ELIG-01 | Drive eligibility and identity (M2 service/schema) | Threshold-qualified student sees the published eligible drive; below-threshold student and forged other-student lookup are denied/excluded. |
| M35-DEL-01 | History-preserving delete guards (M2 schema) | Deleting a student, drive, company or clearance item with linked history fails; offers remain. |
| M35-IMP-01 | Preview, confirmation and import persistence (M3-2 + M2 RPC + M1 UI) | Preview is read-only; unconfirmed submit writes nothing; explicit partial confirmation reports 1 success, 3 skipped, 2 failed of 6; existing student fields remain unchanged. |
| M35-ND-01 | Mandatory no-dues completion (M2 RPC + M3 report) | 4 cleared, 16 incomplete, 10 not configured; 40 mandatory student-item pairs partition as 16 cleared, 4 not applicable, 4 pending, 4 rejected, 12 missing. Rejected/missing/pending mandatory items block completion; optional/inactive items do not. |
| M35-EXP-01 | Authorized CSV/XLSX export (M3-4 + M2 snapshot/RLS) | Expected row counts and actual student/offer/statement values are exported; all 30 statement rows include full mandatory status, not just currently displayed items. |
| M35-AUTH-01 | Demo account role/scope (M2 auth/RLS) | Exactly one in-charge and three student demo identities; each profile has its expected role/link; student sessions cannot call in-charge consolidated reports. |
| M35-LOGIN-01 | Hosted password checks (M2 auth + M3-5 runner) | Each account passes login, restored role/link, logout and invalid-password rejection. Missing local password is BLOCKED, never a pass. |
| M35-UI-01 | Browser import flow (M1 UI + M3-2 importer) | CSV/XLSX preview is visible before confirmation; invalid rows block atomic commit; successful confirmation reloads persisted data. Run `npm run test:import-ui`. |

Invalid/negative expectations include: missing in-charge seed actor (reject); bad email (constraint failure); in-charge-only write attempted as student (authorization failure); a student requesting another student's drive list (authorization failure); linked-history deletes (foreign-key/restrict failure); malformed and duplicate import identities (failed rows, not overwritten); unknown eligibility (not eligible); cancelled drive and withdrawn/declined/revoked outcomes (zero successful placements); and missing/rejected mandatory clearance (incomplete). The import UI test additionally covers file validation and preview behavior when its browser runtime can start.

## Team integration

- **Member 2 owns database behavior:** migration order, RLS, Auth/profile provisioning, eligibility, delete constraints, import transaction, snapshot/report RPCs and no-dues decisions. The seed calls those existing contracts; it adds no migration and no browser privilege.
- **Member 1 owns presentation:** role routes, import preview/confirmation UI, analytics/report display and downloads. UI-01 must call existing Member 3 import/export modules and trusted Member 2 services; the UI must not recompute placements, self-approve clearances, or assign a role.
- **Member 3 owns deterministic fixture generation and expected-value acceptance.** Keep these IDs when fixing tests; note any contract change in `docs/data-contracts.md`. Members should walk through their owned code during integration review.

## Run locally

Run `npm ci`, then `npm test` for unit and database-backed tests. Run `npm run test:acceptance` for M3-5 DB and provisioning/login-tool acceptance, `npm run build` for the production bundle and `npm run test:import-ui` for browser import checks. `npm run test:demo-logins` is a real hosted Auth check, not a mock; it needs local public config and per-account passwords in ignored `.env.seed.local`. Do not paste secrets in chat.

## Known limitations and hosted-demo gate

Local database acceptance uses isolated PostgreSQL and test Auth identities. It proves implemented database constraints/RPC contracts in that fixture; it does not prove the hosted project's migrations, PostgREST schema exposure, deployed frontend, real Auth accounts, or real user passwords.

The last recorded hosted login run is in [M3-5 hosted login results](test-results/m3-5-hosted-logins.json): 0 passed, 0 failed, 4 blocked because no local demo passwords were provided, and therefore no real password login was attempted. The recent project check reported Auth health HTTP 200 but the departments REST endpoint returned HTTP 404/PGRST205 (relation unavailable in the exposed schema cache). Confirm with Member 2 that this is the intended project, all migrations are applied, and `public` is exposed/refreshed before demo use. Do not seed or provision Auth until that is resolved and the hosted project identity is confirmed. The hosted seed and Auth account provisioning have not been run.

Current validation and hosted readiness are recorded separately in [M3-5 test results](test-results/m3-5.md). A hosted demo is ready only after the production build/browser check pass in a normal project environment, intended project schema endpoints work, hosted seeding is deliberately run, all four real logins pass, and in-charge/student persistence and authorization flows are exercised on that deployment.
