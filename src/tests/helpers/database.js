import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';

const root = new URL('../../../', import.meta.url);
export const readProjectFile = (path) => readFile(new URL(path, root), 'utf8');

export async function createTestDatabase() {
  const db = await PGlite.create({ extensions: { citext, uuid_ossp } });
  // Test-only JWT/auth schema. Production uses the real Supabase auth schema.
  await db.exec(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE ROLE authenticated NOLOGIN; CREATE ROLE anon NOLOGIN;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_user::text; $$;`);
  for (const file of (await readdir(new URL('supabase/migrations/', root))).filter((name) => name.endsWith('.sql')).sort()) {
    await db.exec(await readProjectFile(`supabase/migrations/${file}`));
  }
  await db.exec(`GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;`);
  return db;
}

export async function withUser(db, id, fn, role = 'authenticated') {
  await db.exec(role === 'anon' ? 'SET ROLE anon' : 'SET ROLE authenticated');
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [id ?? '']);
  try { return await fn(); } finally {
    await db.exec('RESET ROLE');
    await db.query("SELECT set_config('request.jwt.claim.sub', '', false)");
  }
}
