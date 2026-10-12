import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const seed = await read('supabase/seed/seed.sql');
const admin = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const studentUser = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
const otherUser = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2';
const student = '00000000-0000-0000-0000-000000000001';
const otherStudent = '00000000-0000-0000-0000-000000000002';
const cse = '11111111-1111-1111-1111-111111111111';
const ece = '22222222-2222-2222-2222-222222222222';
const drive = 'e0000000-e000-e000-e000-e00000000001';
const secondDrive = 'e0000000-e000-e000-e000-e00000000002';
const company = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

async function database() {
  const db = await PGlite.create({ extensions: { citext, uuid_ossp } });
  // Supabase auth schema/JWT helpers for SQL tests only. No fake production auth.
  await db.exec(`
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE anon NOLOGIN;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
      SELECT current_user::text;
    $$;
  `);
  const files = (await readdir(new URL('supabase/migrations/', root))).filter((file) => file.endsWith('.sql')).sort();
  for (const file of files) await db.exec(await read(`supabase/migrations/${file}`));
  // Match authenticated data privileges supplied by Supabase; RLS still applies.
  await db.exec(`
    GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
  `);
  return db;
}

async function asUser(db, id, fn, role = 'authenticated') {
  await db.exec(role === 'anon' ? 'SET ROLE anon' : 'SET ROLE authenticated');
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [id ?? '']);
  try { return await fn(); } finally {
    await db.exec('RESET ROLE');
    await db.query("SELECT set_config('request.jwt.claim.sub', '', false)");
  }
}

test('all migrations and seed run on a fresh PostgreSQL database without auth accounts', async () => {
  const db = await database();
  try {
    await db.exec(seed);
    await db.exec(seed); // Re-running the seed neither overwrites nor duplicates rows.
    const { rows } = await db.query(`SELECT
      (SELECT count(*)::int FROM students) AS students,
      (SELECT count(*)::int FROM offers) AS offers,
      (SELECT count(*)::int FROM profiles) AS profiles,
      (SELECT count(*)::int FROM student_clearances WHERE status <> 'pending') AS approved`);
    assert.deepEqual(rows[0], { students: 5, offers: 8, profiles: 0, approved: 0 });
  } finally { await db.close(); }
});

test('phase-one schema integrity, approval seed and student-drive RLS', async (t) => {
  const db = await database();
  try {
    await db.query('INSERT INTO auth.users(id) VALUES ($1), ($2), ($3)', [admin, studentUser, otherUser]);
    await db.query("INSERT INTO profiles(id, role) VALUES ($1, 'placement_incharge'), ($2, 'student'), ($3, 'student')", [admin, studentUser, otherUser]);
    await db.exec(seed);
    await db.query('UPDATE students SET user_id = $1, backlogs = 0 WHERE id = $2', [studentUser, student]);
    await db.query('UPDATE students SET user_id = $1 WHERE id = $2', [otherUser, otherStudent]);

    await t.test('existing in-charge supplies valid approval evidence', async () => {
      const { rows } = await db.query("SELECT approved_by FROM student_clearances WHERE status IN ('cleared', 'not_applicable')");
      assert.equal(rows.length, 3);
      assert.ok(rows.every((row) => row.approved_by === admin));
    });

    await t.test('CGPA 10 is persisted; invalid CGPA, backlogs and eligibility bounds fail', async () => {
      await db.query('UPDATE students SET cgpa = 10 WHERE id = $1', [student]);
      assert.equal(Number((await db.query('SELECT cgpa FROM students WHERE id = $1', [student])).rows[0].cgpa), 10);
      await assert.rejects(db.query('UPDATE students SET cgpa = 10.01 WHERE id = $1', [student]), { code: '23514' });
      await assert.rejects(db.query('UPDATE students SET backlogs = -1 WHERE id = $1', [student]), { code: '23514' });
      await assert.rejects(db.query('UPDATE drives SET min_cgpa = 10.01 WHERE id = $1', [drive]), { code: '23514' });
      await assert.rejects(db.query('UPDATE drives SET max_backlogs = -1 WHERE id = $1', [drive]), { code: '23514' });
      await assert.rejects(db.query("UPDATE drives SET eligible_graduation_years = '{1800}' WHERE id = $1", [drive]), { code: '23514' });
      await assert.rejects(db.query("UPDATE drives SET eligible_graduation_years = '{NULL}' WHERE id = $1", [drive]), { code: '23514' });
    });

    await t.test('linked student, drive and company deletes fail and preserve offers', async () => {
      // PostgreSQL versions distinguish RESTRICT violations (23001) from FK
      // violations (23503); either is an integrity rejection, not a success.
      const blockedDelete = (error) => ['23001', '23503'].includes(error.code);
      await assert.rejects(db.query('DELETE FROM students WHERE id = $1', [student]), blockedDelete);
      await assert.rejects(db.query('DELETE FROM drives WHERE id = $1', [drive]), blockedDelete);
      await assert.rejects(db.query('DELETE FROM companies WHERE id = $1', [company]), blockedDelete);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM offers')).rows[0].n, 8);
      // Unlinked entities still support permitted delete operations.
      await db.exec("INSERT INTO companies(id, name) VALUES ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'Unlinked Demo'); DELETE FROM companies WHERE id = 'ffffffff-ffff-ffff-ffff-ffffffffffff'");
      assert.equal((await db.query("SELECT count(*)::int AS n FROM companies WHERE name = 'Unlinked Demo'")).rows[0].n, 0);
    });

    await t.test('student list hides draft/cancelled drives; in-charge sees all', async () => {
      const visible = await asUser(db, studentUser, () => db.query('SELECT id FROM drives ORDER BY id'));
      assert.deepEqual(visible.rows.map((row) => row.id), [drive, secondDrive]);
      const all = await asUser(db, admin, () => db.query('SELECT id FROM drives'));
      assert.equal(all.rows.length, 4);
      const anonymous = await asUser(db, null, () => db.query('SELECT id FROM drives'), 'anon');
      assert.equal(anonymous.rows.length, 0);
    });

    await t.test('department, year, CGPA and backlog thresholds are enforced by RLS', async () => {
      const canSee = async () => (await asUser(db, studentUser, () => db.query('SELECT id FROM drives WHERE id = $1', [drive]))).rows.length;
      await db.query('UPDATE drives SET eligible_graduation_years = ARRAY[2027], min_cgpa = 8, max_backlogs = 0 WHERE id = $1', [drive]);
      await db.query('INSERT INTO drive_departments(drive_id, department_id) VALUES ($1, $2)', [drive, ece]);
      assert.equal(await canSee(), 0);
      await db.query('UPDATE drive_departments SET department_id = $1 WHERE drive_id = $2', [cse, drive]);
      assert.equal(await canSee(), 1);
      await db.query('UPDATE drives SET eligible_graduation_years = ARRAY[2028] WHERE id = $1', [drive]);
      assert.equal(await canSee(), 0);
      await db.query('UPDATE drives SET eligible_graduation_years = ARRAY[2027] WHERE id = $1', [drive]);
      await db.query('UPDATE students SET cgpa = 7 WHERE id = $1', [student]);
      assert.equal(await canSee(), 0);
      await db.query('UPDATE students SET cgpa = NULL WHERE id = $1', [student]);
      assert.equal(await canSee(), 0);
      await db.query('UPDATE students SET cgpa = 10, backlogs = 1 WHERE id = $1', [student]);
      assert.equal(await canSee(), 0);
      await db.query('UPDATE students SET backlogs = NULL WHERE id = $1', [student]);
      assert.equal(await canSee(), 0);
      await db.query('UPDATE students SET backlogs = 0 WHERE id = $1', [student]);
      assert.equal(await canSee(), 1);
      // No thresholds means an unknown value is allowed, not implicitly zero.
      await db.query('UPDATE drives SET min_cgpa = NULL, max_backlogs = NULL WHERE id = $1', [drive]);
      await db.query('UPDATE students SET cgpa = NULL, backlogs = NULL WHERE id = $1', [student]);
      assert.equal(await canSee(), 1);
      const outsider = await asUser(db, otherUser, () => db.query('SELECT id FROM drives WHERE id = $1', [drive]));
      assert.equal(outsider.rows.length, 1); // Same department/year, unrestricted thresholds.
    });

    await t.test('student read-only page scope cannot mutate drives', async () => {
      const update = await asUser(db, studentUser, () => db.query("UPDATE drives SET title = 'Changed' WHERE id = $1 RETURNING id", [drive]));
      assert.equal(update.rows.length, 0);
      assert.equal((await db.query('SELECT title FROM drives WHERE id = $1', [drive])).rows[0].title, 'Graduate Engineer');
      const ownRecords = await asUser(db, studentUser, () => db.query('SELECT id FROM students'));
      assert.deepEqual(ownRecords.rows.map((row) => row.id), [student]);
    });
  } finally { await db.close(); }
});
