# CampusOS

To connect the app, open your Supabase project’s **Connect** dialog and copy its
actual Project URL and publishable key. Create `.env.local` in this directory and
set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Existing
`VITE_SUPABASE_ANON_KEY` configurations are also supported. Restart `npm run dev`
after saving the settings. `.env.local` is ignored by Git.

The example file intentionally has empty values. Placeholders such as
`your-project-ref` and `your-anon-key` cannot connect to a project.
See [Supabase's React setup guide](https://supabase.com/docs/guides/getting-started/quickstarts/reactjs).

Google sign-in is available through **Continue with Google**. Enable the Google
provider and configure its redirect URLs using [the setup guide](docs/google-authentication.md).
