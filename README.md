# CampusOS

University placement and departmental no-dues portal built with React, Vite and Supabase.

Run `npm ci`, configure `.env.local` using [Supabase setup](docs/supabase-setup.md), then `npm run dev`.

Copy the actual Project URL and public publishable key from Supabase's Connect dialog. The example values are intentionally empty; legacy anon keys remain supported. Restart the dev server after editing `.env.local`, which is ignored by Git.

- [Student CSV/XLSX import (M3-2)](docs/m3-2-student-import.md)
- [Live placement analytics and metric definitions (M3-3)](docs/m3-3-placement-analytics.md)
- [Authorized reports, CSV/Excel exports and print controls (M3-4)](docs/m3-4-reports-and-exports.md)
- [M3-5 deterministic 30-student demo seed and acceptance IDs](docs/m3-5-seed-acceptance.md)
- [M3-5 validation and hosted-demo readiness](docs/test-results/m3-5.md)
- [Shared JavaScript contracts](docs/data-contracts.md)
- [Combined PR integration decisions](docs/merged-pr-integration.md)

Checks: `npm test` (both test folders), `npm run test:acceptance`, `npm run test:import-ui`, `npm run build`. The older `supabase/seed/seed.sql` is the five-student regression fixture; the repeatable 30-student demo data, trusted provisioning steps and hosted-readiness status are documented in [M3-5](docs/m3-5-seed-acceptance.md).

Google sign-in is available through **Continue with Google**. Enable the Google provider and configure its redirect URLs using [the setup guide](docs/google-authentication.md).
