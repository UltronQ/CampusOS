import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createTestDatabase } from './helpers/database.js';
import { createStudentService } from '../src/services/studentBackend.js';
import { createReportService } from '../src/services/reportBackend.js';
import { createClearanceService } from '../src/services/clearanceBackend.js';

const admin = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const user1 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';
const user2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2';
const student1 = '00000000-0000-0000-0000-000000000001';
const student2 = '00000000-0000-0000-0000-000000000002';
const cse = '11111111-1111-1111-1111-111111111111';
const company2 = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const drive1 = 'e0000000-e000-e000-e000-e00000000001';
const app1 = 'a1000000-a100-a100-a100-a10000000001';
const app2 = 'a1000000-a100-a100-a100-a10000000002';
const offer1 = 'b1000000-b100-b100-b100-b10000000001';
const item1 = 'f1000000-f100-f100-f100-f10000000001';
const absent = '99999999-9999-9999-9999-999999999999';
const importRow = (source_row = 2, overrides = {}) => ({ source_row, student: {
  student_number: '006', full_name: 'Student Six', email: 'six@example.test',
  department_code: 'CSE', graduation_year: 2028, cgpa: 8.5, phone: '+91 90000 00006', ...overrides,
} });

test('M2-5 integrated backend audit against the executable development seed', async t => {
  const db = await createTestDatabase();
  async function login(uid, role = 'authenticated') {
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role',$2,true)", [uid, role]);
    await db.exec(role === 'anon' ? 'SET LOCAL ROLE anon' : 'SET LOCAL ROLE authenticated');
  }
  async function scalar(sql, params = []) { return (await db.query(sql, params)).rows[0].value; }
  async function report(kind, filters = {}, students = [], limit = 10000) {
    return scalar('SELECT get_report_records($1,$2::jsonb,$3::uuid[],$4) AS value', [kind, JSON.stringify(filters), students, limit]);
  }
  async function commit(rows) { return scalar('SELECT commit_student_import($1::jsonb) AS value', [JSON.stringify(rows)]); }
  async function fails(sql, params, codes) {
    await db.exec('SAVEPOINT expected_failure');
    try {
      await assert.rejects(db.query(sql, params), error => codes.includes(error.code), sql);
    } finally { await db.exec('ROLLBACK TO SAVEPOINT expected_failure; RELEASE SAVEPOINT expected_failure'); }
  }
  async function scenario(name, run) {
    await t.test(name, async () => {
      await db.exec('BEGIN');
      try { await login(admin); await run(); }
      finally { await db.exec('ROLLBACK'); }
    });
  }
  try {
    // This shim bootstraps IDs only, never Auth passwords or working login tokens.
    await db.query('INSERT INTO auth.users(id) VALUES ($1),($2),($3)', [admin, user1, user2]);
    await db.exec(await readFile(new URL('../supabase/seed/seed.sql', import.meta.url), 'utf8'));

    await scenario('every entity persists, every application table has RLS and references/uniqueness reject bad writes', async () => {
      const expected = { profiles: 3, departments: 3, students: 5, companies: 2, drives: 4,
        applications: 7, recruitment_stages: 3, application_stage_results: 3, offers: 7,
        clearance_items: 5, student_clearances: 6 };
      for (const [table, count] of Object.entries(expected)) {
        assert.equal(await scalar(`SELECT count(*)::int AS value FROM ${table}`), count, table);
        assert.equal(await scalar('SELECT relrowsecurity AS value FROM pg_class WHERE oid=$1::regclass', [table]), true, `${table} RLS`);
      }
      for (const [sql, params, codes] of [
        ['INSERT INTO profiles(id,role) VALUES ($1,\'student\')', [absent], ['23503']],
        ['INSERT INTO students(student_number,full_name,email,department_id,graduation_year) VALUES (\'x\',\'Test\',\'x@example.test\',$1,2027)', [absent], ['23503']],
        ['INSERT INTO drives(company_id,title,start_date) VALUES ($1,\'Test\',\'2026-10-12\')', [absent], ['23503']],
        ['INSERT INTO recruitment_stages(drive_id,name,sequence) VALUES ($1,\'Test\',1)', [absent], ['23503']],
        ['INSERT INTO recruitment_stages(drive_id,name,sequence) VALUES ($1,\'Duplicate\',1)', [drive1], ['23505']],
        ['INSERT INTO applications(student_id,drive_id) VALUES ($1,$2)', [student1, drive1], ['23505']],
        ['INSERT INTO offers(application_id) VALUES ($1)', [absent], ['42501']],
        ['INSERT INTO student_clearances(student_id,clearance_item_id) VALUES ($1,$2)', [student1, item1], ['23505']],
        ['UPDATE students SET user_id=$1 WHERE id=$2', [user1, student2], ['23505']],
      ]) await fails(sql, params, codes);
      assert.equal(await scalar("SELECT count(*)::int AS value FROM pg_constraint WHERE contype='f' AND conrelid IN ('students'::regclass,'drives'::regclass,'applications'::regclass,'offers'::regclass,'student_clearances'::regclass)"), 10);
    });

    await scenario('student identities normalize and invalid direct writes/duplicate roll numbers fail', async () => {
      for (const overrides of ["' 001 ','Other','new@example.test'", "'006','Other',' ONE@EXAMPLE.TEST '"]) {
        await fails(`INSERT INTO students(student_number,full_name,email,department_id,graduation_year) VALUES (${overrides},$1,2028)`, [cse], ['23505']);
      }
      for (const [number, name, email] of [['', 'Test', 'valid@example.test'], ['006', ' ', 'valid@example.test'], ['006', 'Test', 'invalid-email']]) {
        await fails('INSERT INTO students(student_number,full_name,email,department_id,graduation_year) VALUES ($1,$2,$3,$4,2028)', [number, name, email, cse], ['23514']);
      }
      const result = await commit([importRow(2, { student_number: ' 006 ', full_name: ' Student Six ', email: ' SIX@EXAMPLE.TEST ', department_code: ' cse ' })]);
      assert.equal(result.committed, true);
      assert.equal(result.inserted_count, 1);
      assert.equal(result.students[0].source_row, 2);
      const imported = (await db.query('SELECT * FROM students WHERE id=$1', [result.students[0].student_id])).rows[0];
      assert.equal(imported.student_number, '006');
      assert.equal(imported.email, 'six@example.test');
      assert.equal(imported.full_name, 'Student Six');
      assert.equal(imported.user_id, null);
    });

    await scenario('untrusted imports reject invalid values/types and roll back an earlier valid row', async () => {
      const invalid = [
        { student_number: 7 }, { student_number: '' }, { full_name: ' ' }, { email: 'bad' },
        { department_code: 'UNKNOWN' }, { graduation_year: '2028' }, { graduation_year: 2028.5 },
        { graduation_year: 2100 }, { cgpa: -1 }, { cgpa: 10.001 }, { cgpa: 'abc' },
        { phone: 1234567890 }, { phone: '123' }, { phone: 'letters1234567' }, { user_id: user2 }, { role: 'placement_incharge' },
      ];
      for (const overrides of invalid) {
        const result = await commit([importRow(), importRow(3, { student_number: '007', email: 'seven@example.test', ...overrides })]);
        assert.equal(result.committed, false, JSON.stringify(overrides));
        assert.equal(result.inserted_count, 0);
        assert.deepEqual(result.students, []);
        assert.equal(result.errors[0].code, 'INVALID_INPUT');
        assert.equal(await scalar('SELECT count(*)::int AS value FROM students'), 5, 'atomic rollback');
        assert.doesNotMatch(JSON.stringify(result.errors), /INSERT INTO|one@example|SELECT|auth\.users/);
      }
      for (const rows of [[], {}, null, [{ source_row: 1, student: importRow().student }], [importRow(), importRow()]]) {
        assert.equal((await commit(rows)).committed, false);
        assert.equal(await scalar('SELECT count(*)::int AS value FROM students'), 5);
      }
      assert.equal((await commit(Array.from({ length: 10001 }, () => importRow()))).committed, false);
    });

    await scenario('duplicate rolls and case-insensitive emails within/imported against the DB reject the entire batch', async () => {
      for (const rows of [
        [importRow(), importRow(3, { student_number: ' 006 ', email: 'seven@example.test' })],
        [importRow(), importRow(3, { student_number: '007', email: ' SIX@EXAMPLE.TEST ' })],
        [importRow(), importRow(3, { student_number: '001', email: 'seven@example.test' })],
        [importRow(), importRow(3, { student_number: '007', email: 'ONE@EXAMPLE.TEST' })],
      ]) {
        const result = await commit(rows);
        assert.equal(result.committed, false);
        assert.equal(result.errors[0].code, 'CONFLICT');
        assert.equal(await scalar('SELECT count(*)::int AS value FROM students'), 5);
      }
    });

    await scenario('multiple offers per application persist and placement totals exclude withdrawn/cancelled data', async () => {
      assert.deepEqual((await db.query('SELECT * FROM get_recruitment_success_counts()')).rows[0], { successful_offers: 3, placed_students: 2 });
      await db.query('INSERT INTO offers(application_id,annual_ctc_minor) VALUES ($1,0)', [app1]);
      assert.equal(await scalar('SELECT count(*)::int AS value FROM offers WHERE application_id=$1', [app1]), 2);
      assert.deepEqual((await db.query('SELECT * FROM get_recruitment_success_counts()')).rows[0], { successful_offers: 4, placed_students: 2 });
      assert.equal((await report('placement_offers')).row_count, 4);
      const rows = (await report('placement_summary')).rows;
      assert.equal(rows.find(r => r.student_id === student1).successful_offer_count, 3);
      assert.equal(rows.find(r => r.student_id === student2).placed, false);
      await db.query("UPDATE applications SET status='withdrawn' WHERE id=$1", [app1]);
      assert.deepEqual((await db.query('SELECT * FROM get_recruitment_success_counts()')).rows[0], { successful_offers: 2, placed_students: 2 });
      await db.query("UPDATE applications SET status='withdrawn' WHERE id=$1", [app2]);
      assert.deepEqual((await db.query('SELECT * FROM get_recruitment_success_counts()')).rows[0], { successful_offers: 1, placed_students: 1 });
    });

    await scenario('reports query current rows, intersect filters, preserve unplaced cohorts and enforce limits', async () => {
      assert.equal((await report('placement_summary')).row_count, 5);
      assert.equal((await report('placement_offers')).row_count, 3);
      assert.equal((await report('no_dues_statement')).row_count, 5);
      assert.equal((await report('placement_offers', { company_ids: [company2] })).row_count, 2);
      assert.equal((await report('placement_summary', { company_ids: [company2] })).row_count, 5);
      assert.equal((await report('placement_offers', { company_ids: [company2], department_ids: [cse], graduation_years: [2027] })).row_count, 1);
      assert.equal((await report('placement_offers', { drive_start_from: '2026-10-12', drive_start_to: '2026-10-12' })).row_count, 2);
      assert.equal((await report('placement_offers', { drive_statuses: ['published'] })).row_count, 1);
      assert.equal((await report('placement_offers', { drive_statuses: ['completed'] })).row_count, 2);
      assert.equal((await report('placement_offers', { drive_ids: [drive1] })).row_count, 1);
      assert.equal((await report('no_dues_statement', { graduation_years: [2028] })).row_count, 0);
      const canonical = await report('placement_summary', { department_ids: [cse, cse] }, [student1, student1]);
      assert.deepEqual(canonical.filters.department_ids, [cse]);
      assert.deepEqual(canonical.student_ids, [student1]);
      assert.equal(canonical.row_count, 1);
      for (const filters of [{ role: 'placement_incharge' }, { department_ids: ['bad'] }, { department_ids: null },
        { graduation_years: ['2027'] }, { graduation_years: [2027.5] }, { graduation_years: [2100] },
        { drive_statuses: ['cancelled'] }, { drive_start_from: '2026-02-30' },
        { drive_start_from: '2026-12-01', drive_start_to: '2026-01-01' }]) {
        await fails('SELECT get_report_records($1,$2::jsonb)', ['placement_offers', JSON.stringify(filters)], ['22023']);
      }
      await fails('SELECT get_report_records($1,$2::jsonb)', ['no_dues_statement', '{"company_ids":[]}'], ['22023']);
      await fails("SELECT get_report_records('placement_summary','{}','{}',1)", [], ['54000']);
      await fails("SELECT get_report_records('placement_summary','{}','{}',10001)", [], ['22023']);
      await db.query("UPDATE offers SET status='revoked' WHERE id=$1", [offer1]);
      assert.equal((await report('placement_offers')).row_count, 2, 'fresh data after update');
    });

    await scenario('mandatory pending/rejected/missing records block clearance in both reports and statements', async () => {
      const row = (await report('no_dues_statement')).rows.find(r => r.student_id === student2);
      assert.equal(row.overall_status, 'incomplete');
      assert.equal(row.mandatory_pending, 1);
      assert.equal(row.mandatory_missing, 1);
      assert.equal(await scalar('SELECT get_student_no_dues_statement($1)->>\'overall_status\' AS value', [student2]), 'incomplete');
      await db.query('SELECT initialize_student_clearances($1)', [student2]);
      await db.query("UPDATE student_clearances SET status='cleared' WHERE student_id=$1 AND clearance_item_id=$2", [student2, item1]);
      assert.equal((await report('no_dues_statement', {}, [student2])).rows[0].overall_status, 'incomplete');
      await db.query("UPDATE student_clearances SET status='rejected',remarks='Return lab key' WHERE student_id=$1 AND clearance_item_id<>$2", [student2, item1]);
      assert.equal((await report('no_dues_statement', {}, [student2])).rows[0].mandatory_rejected, 1);
      assert.equal(await scalar("SELECT get_no_dues_progress()->'totals'->>'cleared_students' AS value"), '2');
    });

    await scenario('student sessions isolate all private tables/reports and cannot escalate roles or manage privileged entities', async () => {
      for (const uid of [user1, user2]) {
        await login(uid);
        const own = uid === user1 ? student1 : student2;
        const other = uid === user1 ? student2 : student1;
        const otherUid = uid === user1 ? user2 : user1;
        assert.equal(await scalar('SELECT count(*)::int AS value FROM students'), 1);
        assert.equal(await scalar('SELECT count(*)::int AS value FROM students WHERE id=$1', [other]), 0);
        assert.equal(await scalar('SELECT count(*)::int AS value FROM profiles'), 1);
        assert.equal(await scalar('SELECT count(*)::int AS value FROM applications WHERE student_id=$1', [other]), 0);
        assert.equal(await scalar('SELECT count(*)::int AS value FROM student_clearances WHERE student_id=$1', [other]), 0);
        assert.equal(await scalar('SELECT count(*)::int AS value FROM offers WHERE id=$1',
          [uid === user1 ? 'b1000000-b100-b100-b100-b10000000003' : offer1]), 0);
        assert.equal(await scalar('SELECT get_student_id($1) AS value', [otherUid]), null);
        assert.equal(await scalar('SELECT is_placement_incharge($1) AS value', [admin]), false);
        assert.equal((await db.query("UPDATE profiles SET role='placement_incharge' WHERE id=$1 RETURNING id", [uid])).rows.length, 0);
        await fails("INSERT INTO profiles(id,role) VALUES ($1,'placement_incharge') ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role", [uid], ['42501']);
        assert.equal(await scalar('SELECT is_placement_incharge() AS value'), false);
        for (const [sql, params] of [
          ["INSERT INTO companies(name) VALUES ('Unauthorized')", []],
          ["INSERT INTO departments(code,name) VALUES ('UNAUTH','Unauthorized')", []],
          ['SELECT commit_student_import($1::jsonb)', [JSON.stringify([importRow()])]],
          ['SELECT initialize_student_clearances($1)', [own]],
          ['SELECT get_no_dues_progress()', []],
          ['INSERT INTO offers(application_id) VALUES ($1)', [app1]],
        ]) await fails(sql, params, ['42501']);
        for (const sql of ["UPDATE students SET full_name='Hijacked' RETURNING id", "UPDATE profiles SET role='placement_incharge' RETURNING id",
          "UPDATE companies SET name='Hijacked' RETURNING id", "UPDATE drives SET status='cancelled' RETURNING id",
          "UPDATE clearance_items SET is_mandatory=false RETURNING id", "UPDATE student_clearances SET remarks='Tampered' RETURNING id",
          'DELETE FROM student_clearances RETURNING id', 'DELETE FROM applications RETURNING id']) {
          assert.equal((await db.query(sql)).rows.length, 0, sql);
        }
        assert.equal((await db.query("UPDATE applications SET status='withdrawn' WHERE student_id=$1 RETURNING id", [other])).rows.length, 0);
        assert.equal((await db.query("UPDATE offers SET status='accepted' WHERE application_id IN (SELECT id FROM applications WHERE student_id=$1) RETURNING id", [other])).rows.length, 0);
        for (const kind of ['placement_summary', 'placement_offers', 'no_dues_statement']) {
          const visible = await report(kind);
          assert.ok(visible.rows.every(row => row.student_id === own));
          assert.equal((await report(kind, {}, [other])).row_count, 0);
        }
        assert.equal(await scalar('SELECT count(*)::int AS value FROM drives WHERE status=\'draft\''), 0);
        assert.equal(await scalar("SELECT count(*)::int AS value FROM recruitment_stages WHERE name='Unpublished Stage'"), 0);
        assert.equal(await scalar('SELECT count(*)::int AS value FROM application_stage_results WHERE published_at IS NULL'), 0);
        const results = (await db.query('SELECT application_id FROM application_stage_results')).rows;
        assert.deepEqual(results, uid === user1 ? [{ application_id: app1 }] : []);
      }
    });

    await scenario('stage results cannot cross drives and stage uniqueness/dependencies are enforced', async () => {
      await fails('INSERT INTO application_stage_results(application_id,stage_id,status) VALUES ($1,$2,\'passed\')',
        [app1, '91000000-0000-0000-0000-000000000002'], ['23514']);
      await fails('DELETE FROM recruitment_stages WHERE id=$1', ['91000000-0000-0000-0000-000000000001'], ['23503', '23001']);
      await fails('UPDATE recruitment_stages SET drive_id=$1 WHERE id=$2', [drive1, '91000000-0000-0000-0000-000000000002'], ['23514']);
      await login(user1);
      await fails('INSERT INTO application_stage_results(application_id,stage_id,status) VALUES ($1,$2,\'passed\')',
        [app1, '91000000-0000-0000-0000-000000000001'], ['42501']);
      await fails("UPDATE applications SET status='rejected' WHERE id=$1", [app1], ['42501']);
      await fails('UPDATE offers SET annual_ctc_minor=1 WHERE id=$1', [offer1], ['42501']);
    });

    await scenario('temporary-table shadowing and public-schema replacement cannot forge in-charge authorization', async () => {
      await db.query("UPDATE public.applications SET status='withdrawn' WHERE id=$1", [app1]);
      await login(user1);
      await db.exec('CREATE TEMP TABLE profiles(id UUID,role public.user_role); CREATE TEMP TABLE students(id UUID,user_id UUID)');
      await db.query("INSERT INTO pg_temp.profiles VALUES ($1,'placement_incharge')", [user1]);
      await db.query('INSERT INTO pg_temp.students VALUES ($1,$2)', [student2, user1]);
      assert.equal(await scalar('SELECT public.is_placement_incharge() AS value'), false);
      assert.equal(await scalar('SELECT public.get_student_id() AS value'), student1);
      assert.equal((await db.query("UPDATE public.profiles SET role='placement_incharge' RETURNING id")).rows.length, 0);
      await fails('CREATE TABLE public.attacker_table(id UUID)', [], ['42501']);
      await fails("SELECT public.commit_student_import($1::jsonb)", [JSON.stringify([importRow()])], ['42501']);
      await fails("UPDATE public.applications SET status='rejected' WHERE id=$1", [app1], ['42501']);
      await db.exec('CREATE TEMP TABLE applications (LIKE public.applications)');
      await db.query('INSERT INTO pg_temp.applications SELECT * FROM public.applications WHERE id=$1', [app1]);
      await db.exec("UPDATE pg_temp.applications SET status='selected'");
      await fails("UPDATE public.offers SET status='accepted' WHERE id=$1", [offer1], ['23514']);
    });

    await scenario('anonymous callers cannot read private data or invoke privileged/report functions', async () => {
      await login('', 'anon');
      for (const table of ['profiles', 'students', 'applications', 'offers', 'student_clearances', 'application_stage_results']) {
        assert.equal(await scalar(`SELECT count(*)::int AS value FROM ${table}`), 0, table);
      }
      for (const [sql, params] of [
        ["SELECT get_report_records('placement_summary')", []],
        ['SELECT commit_student_import($1::jsonb)', [JSON.stringify([importRow()])]],
        ['SELECT initialize_student_clearances($1)', [student1]],
        ['SELECT get_student_no_dues_statement($1)', [student1]],
        ['SELECT get_no_dues_progress()', []],
      ]) await fails(sql, params, ['42501']);
    });

    await scenario('Member 1/3 service contracts execute against real RPCs from import to filtered reports and statements', async () => {
      const client = { rpc: async (name, args) => {
        try {
          const calls = {
            commit_student_import: ['SELECT commit_student_import($1::jsonb) AS value', [JSON.stringify(args.p_rows)]],
            get_report_records: ['SELECT get_report_records($1,$2::jsonb,$3::uuid[],$4) AS value', [args.p_kind, JSON.stringify(args.p_filters), args.p_student_ids, args.p_limit]],
            get_student_no_dues_statement: ['SELECT get_student_no_dues_statement($1) AS value', [args.p_student_id]],
          };
          const [sql, params] = calls[name];
          return { data: await scalar(sql, params), error: null };
        } catch (error) { return { data: null, error }; }
      } };
      const preview = { mode: 'insert_only_atomic', validation: { can_commit: true }, blocked_count: 0,
        insert_count: 1, rows: [{ action: 'insert', ...importRow(), department_id: absent }] };
      const result = await createStudentService(client).commitStudentImport(preview);
      assert.equal(result.committed, true);
      const records = await createReportService(client).queryReportRecords({ kind: 'no_dues_statement', filters: { graduation_years: [2028] } });
      assert.equal(records.row_count, 1);
      assert.equal(records.rows[0].student_id, result.students[0].student_id);
      assert.equal(records.rows[0].overall_status, 'incomplete');
      const statement = await createClearanceService(client).getStudentNoDuesStatement(result.students[0].student_id);
      assert.equal(statement.mandatory_missing, 2);
      assert.equal(statement.items.length, 3);
      assert.equal(statement.department_id, cse, 'preview department ID is never trusted');
    });
  } finally { await db.close(); }
});
