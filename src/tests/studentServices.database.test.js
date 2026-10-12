import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTestDatabase, readProjectFile, withUser } from './helpers/database.js';

const admin = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const userA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
const userB = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2';
const studentA = '00000000-0000-0000-0000-000000000001';
const studentB = '00000000-0000-0000-0000-000000000002';
const cse = '11111111-1111-1111-1111-111111111111';

function row(number, source = 2, changes = {}) {
  return { source_row: source, student: { student_number: number, full_name: `Demo ${number}`,
    email: `${number}@example.test`, department_code: 'CSE', graduation_year: 2027,
    cgpa: 8.5, phone: null, backlogs: 0, ...changes } };
}

test('M2-2 trusted student/department services and import persistence', async (t) => {
  const db = await createTestDatabase();
  const adminQuery = (sql, values) => withUser(db, admin, () => db.query(sql, values));
  const commit = async (rows, mode = 'atomic', actor = admin, confirmed = true) =>
    (await withUser(db, actor, () => db.query('SELECT public.commit_student_import($1::jsonb, $2, $3) AS result', [JSON.stringify(rows), confirmed, mode]))).rows[0].result;
  const studentCount = async () => (await db.query('SELECT count(*)::int AS n FROM students')).rows[0].n;
  try {
    await db.query('INSERT INTO auth.users(id) VALUES ($1), ($2), ($3)', [admin, userA, userB]);
    await db.query("INSERT INTO profiles(id, role) VALUES ($1, 'placement_incharge'), ($2, 'student'), ($3, 'student')", [admin, userA, userB]);
    await db.exec(await readProjectFile('supabase/seed/seed.sql'));
    await db.query('UPDATE students SET user_id = $1 WHERE id = $2', [userA, studentA]);
    await db.query('UPDATE students SET user_id = $1 WHERE id = $2', [userB, studentB]);

    await t.test('in-charge creates and updates normalized registration/academic fields', async () => {
      const created = await adminQuery(`INSERT INTO students(student_number, full_name, email, department_id,
        graduation_year, cgpa, backlogs, program, academic_year, section, placement_registered, eligibility_status)
        VALUES (' 006 ', ' Demo Six ', ' SIX@EXAMPLE.TEST ', $1, 2027, 10, 0, ' B.Tech ', 4, ' A ', true, 'eligible') RETURNING *`, [cse]);
      const s = created.rows[0];
      assert.equal(s.student_number, '006'); assert.equal(s.email, 'six@example.test');
      assert.equal(s.placement_registered, true); assert.equal(s.program, 'B.Tech');
      await adminQuery("UPDATE students SET eligibility_status = 'ineligible', backlogs = 2 WHERE id = $1", [s.id]);
      const persisted = (await adminQuery('SELECT eligibility_status, backlogs FROM students WHERE id = $1', [s.id])).rows[0];
      assert.deepEqual(persisted, { eligibility_status: 'ineligible', backlogs: 2 });
      await assert.rejects(adminQuery("UPDATE students SET full_name = '   ' WHERE id = $1", [s.id]), { code: '23514' });
      await assert.rejects(adminQuery("UPDATE students SET email = 'broken' WHERE id = $1", [s.id]), { code: '23514' });
      await assert.rejects(adminQuery('UPDATE students SET academic_year = 9 WHERE id = $1', [s.id]), { code: '23514' });
      await assert.rejects(adminQuery("UPDATE students SET eligibility_status = 'invented' WHERE id = $1", [s.id]), { code: '23514' });
      await assert.rejects(adminQuery('UPDATE students SET user_id = $1 WHERE id = $2', [admin, s.id]), { code: '23514' });
    });

    await t.test('students cannot escalate roles, change registration, or read another student', async () => {
      const roles = await withUser(db, userA, () => db.query("UPDATE profiles SET role = 'placement_incharge' WHERE id = $1 RETURNING id", [userA]));
      assert.equal(roles.rows.length, 0);
      const registration = await withUser(db, userA, () => db.query('UPDATE students SET placement_registered = true WHERE id = $1 RETURNING id', [studentA]));
      assert.equal(registration.rows.length, 0);
      const visible = await withUser(db, userA, () => db.query('SELECT id FROM students'));
      assert.deepEqual(visible.rows.map((s) => s.id), [studentA]);
      const others = await withUser(db, userA, () => db.query('SELECT id FROM students WHERE id = $1', [studentB]));
      assert.equal(others.rows.length, 0);
      await assert.rejects(withUser(db, userA, () => db.query("INSERT INTO students(student_number,full_name,email,department_id,graduation_year) VALUES ('evil','Demo','evil@example.test',$1,2027)", [cse])), { code: '42501' });
      const helper = await withUser(db, userA, () => db.query('SELECT public.get_student_id($1) AS id, public.is_placement_incharge($2) AS elevated', [userB, admin]));
      assert.deepEqual(helper.rows[0], { id: null, elevated: false });
    });

    await t.test('department management normalizes values and enforces authorization', async () => {
      const d = (await adminQuery("INSERT INTO departments(code,name) VALUES (' civil ', ' Civil Engineering ') RETURNING *")).rows[0];
      assert.equal(d.code, 'CIVIL'); assert.equal(d.name, 'Civil Engineering');
      await adminQuery("UPDATE departments SET name = 'Civil' WHERE id = $1", [d.id]);
      await assert.rejects(adminQuery("INSERT INTO departments(code,name) VALUES ('civil','Duplicate')"), { code: '23505' });
      await assert.rejects(adminQuery("INSERT INTO departments(code,name) VALUES ('','Missing')"), { code: '23514' });
      await assert.rejects(withUser(db, userA, () => db.query("INSERT INTO departments(code,name) VALUES ('BAD','Unauthorized')")), { code: '42501' });
      await adminQuery('DELETE FROM departments WHERE id = $1', [d.id]);
      await assert.rejects(adminQuery('DELETE FROM departments WHERE id = $1', [cse]), (e) => ['23001','23503'].includes(e.code));
    });

    await t.test('directory search/filter/pagination uses authorized rows and literal search', async () => {
      const r = (await adminQuery("SELECT public.search_students('Six',$1,2027,true,'ineligible',0,1) AS result", [cse])).rows[0].result;
      assert.equal(r.total, 1); assert.equal(r.students[0].student_number, '006');
      assert.equal(r.students[0].department.code, 'CSE');
      const literal = (await adminQuery("SELECT public.search_students('%') AS result")).rows[0].result;
      assert.equal(literal.total, 0);
      const own = (await withUser(db, userA, () => db.query("SELECT public.search_students('') AS result"))).rows[0].result;
      assert.equal(own.total, 1); assert.equal(own.students[0].id, studentA);
      const page = (await adminQuery("SELECT public.search_students('',NULL,NULL,NULL,NULL,1,2) AS result")).rows[0].result;
      assert.equal(page.total, 6); assert.equal(page.students.length, 2);
      await assert.rejects(adminQuery("SELECT public.search_students('',NULL,NULL,NULL,NULL,-1,2)"), { code: '22023' });
    });

    await t.test('import requires confirmation and in-charge role, including direct RPC calls', async () => {
      await assert.rejects(commit([row('100')], 'atomic', admin, false), { code: '22023' });
      await assert.rejects(commit([row('100')], 'atomic', userA), { code: '42501' });
      await assert.rejects(commit([row('100')], 'atomic', null), { code: '42501' });
      const anonymous = () => withUser(db, null, () => db.query('SELECT public.commit_student_import($1::jsonb,true)', [JSON.stringify([row('100')])]), 'anon');
      await assert.rejects(anonymous(), { code: '42501' });
      await assert.rejects(commit([]), { code: '22023' });
      await assert.rejects(commit([row('100', 1)]), { code: '22023' });
      await assert.rejects(commit([row('100'), row('101')]), { code: '22023' });
    });

    await t.test('confirmed valid import persists leading-zero identifiers and audit counts', async () => {
      const before = await studentCount();
      const result = await commit([row('010', 2), row('011', 3)]);
      assert.equal(result.committed, true); assert.equal(result.inserted_count, 2);
      assert.equal(result.successful_count, 2); assert.equal(result.failed_count, 0); assert.equal(result.skipped_count, 0);
      assert.equal(await studentCount(), before + 2);
      assert.deepEqual(result.row_results.map((r) => r.source_row), [2, 3]);
      const audit = (await adminQuery('SELECT * FROM student_import_history WHERE id = $1', [result.history_id])).rows[0];
      assert.equal(audit.actor_id, admin); assert.equal(audit.total_count, 2);
    });

    await t.test('atomic malformed email rolls back the preceding valid insert with row diagnostics', async () => {
      const before = await studentCount();
      const result = await commit([row('020', 2), row('021', 3, { email: 'broken' })]);
      assert.equal(result.committed, false); assert.equal(result.failed_count, 1); assert.equal(result.skipped_count, 1);
      assert.equal(result.successful_count, 0); assert.equal(result.students.length, 0);
      assert.equal(result.errors[0].source_row, 3); assert.equal(result.errors[0].field, 'email');
      assert.equal(await studentCount(), before);
      assert.equal((await db.query("SELECT count(*)::int AS n FROM students WHERE student_number = '020'")).rows[0].n, 0);
    });

    await t.test('missing/numeric roll numbers, unknown departments and forged fields fail', async () => {
      for (const change of [{ student_number: '' }, { student_number: '\t\r\n' }, { full_name: '\t' }, { student_number: 22 }, { department_code: 'UNKNOWN' },
        { role: 'placement_incharge' }, { user_id: userA }, { backlogs: -1 }, { cgpa: 10.01 },
        { graduation_year: 2031 }, { phone: 9000000000 }, { placement_registered: 'true' }]) {
        const result = await commit([row('030', 2, change)]);
        assert.equal(result.failed_count, 1, JSON.stringify(change));
        assert.equal(result.successful_count, 0);
        assert.equal(result.errors[0].source_row, 2);
      }
    });

    await t.test('all within-file duplicate members are marked; no duplicates are inserted', async () => {
      const before = await studentCount();
      const result = await commit([row('040', 2), row('040', 3)]);
      assert.equal(result.failed_count, 2); assert.equal(result.duplicate_count, 2);
      assert.ok(result.errors.every((e) => e.code === 'DUPLICATE_STUDENT_NUMBER'));
      const emails = await commit([row('041', 2, { email: ' DUP@EXAMPLE.TEST ' }), row('042', 3, { email: 'dup@example.test' })]);
      assert.equal(emails.duplicate_count, 2);
      assert.ok(emails.errors.every((e) => e.code === 'DUPLICATE_EMAIL'));
      assert.equal(await studentCount(), before);
    });

    await t.test('partial import succeeds/skips/fails without overwriting existing student', async () => {
      const existingName = (await db.query('SELECT full_name FROM students WHERE id = $1', [studentA])).rows[0].full_name;
      const result = await commit([row('050', 2), row('001', 3, { full_name: 'Do not overwrite' }), row('051', 4, { email: 'bad' })], 'partial');
      assert.equal(result.successful_count, 1); assert.equal(result.skipped_count, 1); assert.equal(result.failed_count, 1);
      assert.equal(result.duplicate_count, 1); assert.equal(result.total_count, 3);
      assert.deepEqual(result.row_results.map((r) => r.status), ['successful','skipped','failed']);
      assert.equal((await db.query('SELECT full_name FROM students WHERE id = $1', [studentA])).rows[0].full_name, existingName);
      const replay = await commit([row('050', 2)], 'partial');
      assert.equal(replay.skipped_count, 1); assert.equal(replay.successful_count, 0);
    });

    await t.test('import context is complete/configurable and history cannot be forged', async () => {
      const context = (await adminQuery('SELECT public.get_student_import_context() AS result')).rows[0].result;
      assert.equal(context.max_rows, 1000); assert.equal(context.existing_students.length, await studentCount());
      await assert.rejects(withUser(db, userA, () => db.query('SELECT public.get_student_import_context()')), { code: '42501' });
      const hidden = await withUser(db, userA, () => db.query('SELECT * FROM student_import_history'));
      assert.equal(hidden.rows.length, 0);
      await assert.rejects(adminQuery("INSERT INTO student_import_history(actor_id,mode,total_count,successful_count,skipped_count,failed_count,duplicate_count) VALUES ($1,'atomic',1,1,0,0,0)", [admin]), { code: '42501' });
      await adminQuery('UPDATE student_import_settings SET max_rows = 1 WHERE id = true');
      await assert.rejects(commit([row('060', 2), row('061', 3)]), { code: '22023' });
    });
  } finally { await db.close(); }
});
