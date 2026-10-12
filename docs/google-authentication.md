# Google OAuth sign-in

The sign-in screen now offers **Continue with Google** alongside password sign-in.
Supabase performs Google OAuth with PKCE; the public `/auth/callback` route exchanges
the code once, verifies the authenticated user and loads its CampusOS profile.
Roles still come only from `public.profiles`. Google metadata cannot assign a role,
and unprovisioned/unsupported accounts are signed out with an actionable error.

The browser reads public Auth provider settings before redirecting. A disabled
Google provider produces an in-app error rather than navigating to an unavailable
provider. The provider was disabled during the implementation check; its project
configuration must be completed before real Google sign-in succeeds.

## Project setup

Follow the [official Supabase Google guide](https://supabase.com/docs/guides/auth/social-login/auth-google):

1. In Google Auth Platform, configure the consent screen and create an OAuth client
   of type **Web application**. If the app is in testing, add your test users.
2. Add your application's origin under **Authorized JavaScript origins** (for
   example your actual localhost port during development, and the production origin).
3. In **Authorized redirect URIs**, add your Supabase project's callback URL from
   the provider page: `<SUPABASE_PROJECT_URL>/auth/v1/callback`.
4. In Supabase **Authentication → Sign In / Providers → Google**, enable Google and
   save the Google Client ID and Client Secret. Store the secret only in Supabase's
   provider settings; no Google secret belongs in Vite/browser configuration.
5. In Supabase's URL Configuration, set the application Site URL and allow
   `<APP_ORIGIN>/auth/callback`. Development and production origins must each be
   configured. The app derives its redirect from the current browser origin.

The Google redirect URI points to Supabase, while Supabase's application redirect
points to `/auth/callback`; they serve different steps of the flow. If you use
`localhost`, start and finish on `localhost`, not `127.0.0.1`, because the PKCE verifier
is stored in that browser origin. Restart the dev server after changing `.env.local`.

Keep the project's existing browser URL/key configuration. No Google Client ID or
Client Secret is needed in `.env.local`. Existing verified email/password accounts
may link Google identities according to Supabase's identity-linking rules. A newly
created Auth user still needs an in-charge-provisioned `profiles` role and, for a
student, the matching `students.user_id` link before CampusOS data can be accessed.

## Behavior and verification

The client uses `flowType: pkce` and disables automatic URL exchange so the callback
owns the exchange explicitly. The callback deduplicates effect replays under React
StrictMode, clears the callback code through replacement navigation, and recovers
from cancelled, expired, malformed and unprovisioned logins. Supabase manages its
PKCE verifier/session; the app requests no extra Google API scopes and does not
store provider tokens separately. Password
login, logout and role restoration use the existing auth boundary.

The return path is kept in optional session storage, then validated against the
verified role's local route prefix. Off-site, cross-role and traversal redirects
fall back to the role home. Storage blocking does not prevent sign-in.

Run `npm test` for OAuth service, role, error and redirect cases. The browser test
`npm run test:google-ui` uses an isolated, mocked Auth transport with the real
Supabase SDK to test button wiring, PKCE callback exchange and StrictMode behavior.
It never signs into a real Google account. Live Google consent requires the provider
configuration above and a real provisioned user, and cannot be validated with just
the project's browser publishable key.
