# M2-5 verification results

Recorded 12 October 2026 for the backend integration changes.

| Check executed | Result |
| --- | --- |
| `npm test` | PASS — 36 tests, 0 failures, 0 skipped; approximately 8 seconds |
| Integrated seed/security/report matrix (included above) | PASS — 12 scenarios plus parent test; every scenario rolls back its changes |
| `npm run build` | PASS — 111 modules transformed; existing 506.50 kB JavaScript bundle warning |
| `git diff --check` | PASS — no whitespace errors |

The test runner applies all seven migrations to fresh embedded PostgreSQL
instances. It executes the repaired development seed and exercises two student
identities, an in-charge and anonymous access with real RLS roles. The matrix
includes imports, duplicates/rollback, every entity, foreign keys, role escalation,
private-record isolation, multiple offers/exclusions, mandatory no-dues, current
filtered report rows, stage integrity, temporary-table attacks and service-to-RPC
integration. The other suites retain recruitment and clearance regressions and
test service payloads, public error contracts and CSV safety.

Reproduce with `npm ci` followed by `npm test` and `npm run build`.
For only the integrated matrix, run `npm run test:integration`.

These results use a minimal Supabase Auth identity/claim shim and core UUID
generation in place of uuid-ossp. They do not attest to live JWT authentication,
PostgREST transport, concurrent network requests or Member 1/3 file/UI flows.
Migrations were not applied to a live project. Human Member 1/3 acknowledgement
remains pending. See [integration handoff](backend-integration-handoff.md).
