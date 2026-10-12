import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';

test('PostgreSQL recruitment migration and SQL authorization/invariant suite', async () => {
  const db = new PGlite({ extensions: { citext } });
  try {
    // Minimal Supabase identity shim; RLS runs as a real non-superuser role.
    await db.exec(`
      CREATE ROLE authenticated NOLOGIN;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
        $$ SELECT current_setting('request.jwt.claim.role', true) $$;
      GRANT USAGE ON SCHEMA auth TO authenticated;
      GRANT SELECT ON auth.users TO authenticated;
      CREATE FUNCTION public.uuid_generate_v4() RETURNS uuid LANGUAGE sql AS
        $$ SELECT gen_random_uuid() $$;
    `);
    for (const filename of ['20251012000001_initial_schema.sql',
      '20251012000002_rls_policies.sql', '20261012000003_recruitment.sql']) {
      const sql = await readFile(new URL(`../supabase/migrations/${filename}`, import.meta.url), 'utf8');
      // PGlite uses core gen_random_uuid instead of the uuid-ossp extension.
      await db.exec(sql.replace('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";', ''));
    }
    // Supabase normally supplies these table privileges by default.
    await db.exec('GRANT USAGE ON SCHEMA public TO authenticated; GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;');
    await db.exec(await readFile(new URL('../supabase/tests/recruitment.sql', import.meta.url), 'utf8'));
  } finally {
    await db.close();
  }
});
