import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';

export async function createTestDatabase() {
  const db = new PGlite({ extensions: { citext } });
  try {
    // Minimal Supabase identity shim; RLS runs as a real non-superuser role.
    await db.exec(`
      CREATE ROLE authenticated NOLOGIN;
      CREATE ROLE anon NOLOGIN;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
        $$ SELECT current_setting('request.jwt.claim.role', true) $$;
      GRANT USAGE ON SCHEMA auth TO authenticated, anon;
      GRANT SELECT ON auth.users TO authenticated;
      CREATE FUNCTION public.uuid_generate_v4() RETURNS uuid LANGUAGE sql AS
        $$ SELECT gen_random_uuid() $$;
    `);
    const directory = new URL('../../supabase/migrations/', import.meta.url);
    for (const filename of (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()) {
      const sql = await readFile(new URL(filename, directory), 'utf8');
      // PGlite uses core gen_random_uuid instead of the uuid-ossp extension.
      await db.exec(sql.replace('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";', ''));
    }
    // Supabase normally supplies these table privileges by default.
    await db.exec('GRANT USAGE ON SCHEMA public TO authenticated, anon; GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, anon;');
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}
