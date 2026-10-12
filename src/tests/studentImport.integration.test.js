import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStudentImportService } from '../features/import/studentImport.js';
import { createStudentManagementService } from '../services/studentManagementService.js';
import { getStudentImportTemplate, SAMPLE_VALID_ROWS, SAMPLE_INVALID_ROWS } from '../features/import/studentTemplates.js';
import { createTestDatabase, readProjectFile, withUser } from './helpers/database.js';

const actor = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const cse = '11111111-1111-1111-1111-111111111111';
function makeFile(format, rows) {
  const { blob, filename } = getStudentImportTemplate(format, { rows });
  return new File([blob], filename);
}

test('M3 file -> preview -> confirmation -> Member 2 service -> PostgreSQL persistence', async (t) => {
  const db = await createTestDatabase();
  let commits = 0;
  const client = {
    async rpc(name, args = {}) {
      try {
        let response;
        if (name === 'get_student_import_context') {
          response = await withUser(db, actor, () => db.query('SELECT public.get_student_import_context() AS result'));
        } else if (name === 'commit_student_import') {
          commits++;
          response = await withUser(db, actor, () => db.query('SELECT public.commit_student_import($1::jsonb,$2,$3) AS result', [JSON.stringify(args.p_rows), args.p_confirmed, args.p_mode]));
        } else throw new Error(`Unexpected RPC ${name}`);
        return { data: response.rows[0].result, error: null };
      } catch (error) { return { data: null, error }; }
    },
  };
  const backend = createStudentManagementService(() => client);
  const workflow = createStudentImportService(backend);
  const find = async (number) => (await db.query('SELECT * FROM students WHERE student_number = $1', [number])).rows;
  try {
    await db.query('INSERT INTO auth.users(id) VALUES ($1)', [actor]);
    await db.query("INSERT INTO profiles(id,role) VALUES ($1,'placement_incharge')", [actor]);
    await db.exec(await readProjectFile('supabase/seed/seed.sql'));

    await t.test('valid CSV stays read-only until confirmation and persists every row', async () => {
      const preview = await workflow.previewFile(makeFile('csv', SAMPLE_VALID_ROWS));
      assert.equal(preview.can_commit, true); assert.equal(commits, 0); assert.equal((await find('006')).length, 0);
      await assert.rejects(workflow.confirmImport(preview, { confirmed: false })); assert.equal(commits, 0);
      const result = await workflow.confirmImport(preview, { confirmed: true });
      assert.equal(result.successful_count, 2); assert.equal(result.total_count, 2);
      assert.equal((await find('006'))[0].email, 'six@example.test');
      assert.equal((await find('006'))[0].phone, '+91 90000 00006');
      assert.equal((await find('007')).length, 1);
      await assert.rejects(workflow.confirmImport(preview, { confirmed: true })); assert.equal(commits, 1);
    });

    await t.test('existing identity detection is backed by Member 2 context, not a static fixture', async () => {
      const preview = await workflow.previewFile(makeFile('xlsx', SAMPLE_VALID_ROWS));
      assert.equal(preview.can_commit, false); assert.equal(preview.validation.duplicate_rows, 2);
      assert.ok(preview.validation.rows[0].errors.some((error) => error.code === 'EXISTING_STUDENT_NUMBER'));
    });

    await t.test('mixed invalid Excel is blocked atomically; confirmed partial mode reconciles all rows', async () => {
      const mixed = SAMPLE_INVALID_ROWS.map((row) => [...row]);
      mixed[0][0] = '016'; mixed[0][2] = 'sixteen@example.test'; mixed[2][0] = '017';
      const file = makeFile('xlsx', mixed);
      const atomic = await workflow.previewFile(file);
      assert.equal(atomic.can_commit, false);
      const before = commits;
      await assert.rejects(workflow.confirmImport(atomic, { confirmed: true })); assert.equal(commits, before);
      const partial = await workflow.previewFile(file, { mode: 'partial' });
      assert.equal(partial.can_commit, true); assert.equal(partial.insert_count, 1);
      const result = await workflow.confirmImport(partial, { confirmed: true, mode: 'partial' });
      assert.equal(result.successful_count, 1); assert.equal(result.failed_count, 2); assert.equal(result.skipped_count, 3);
      assert.equal(result.total_count, 6); assert.equal(result.duplicate_count, 3);
      assert.equal(result.backend_counts.total_count, 1); assert.equal(result.local_rejected_count, 5);
      assert.deepEqual(result.row_results.map((row) => row.source_row), [2,3,4,5,6,7]);
      assert.equal((await find('016')).length, 1); assert.equal((await find('017')).length, 0); assert.equal((await find('008')).length, 0);
      assert.equal((await find('001'))[0].full_name, 'Demo Student One');
      const history = await db.query('SELECT successful_count,total_count FROM student_import_history WHERE id = $1', [result.history_id]);
      assert.deepEqual(history.rows[0], { successful_count: 1, total_count: 1 });
    });

    await t.test('database race after preview cannot overwrite a newly existing student', async () => {
      const late = [...SAMPLE_VALID_ROWS[0]]; late[0] = '020'; late[2] = 'twenty@example.test';
      const preview = await workflow.previewFile(makeFile('csv',[late]), { mode: 'partial' });
      await db.query("INSERT INTO students(student_number,full_name,email,department_id,graduation_year) VALUES ('020','Concurrent Demo','other-twenty@example.test',$1,2027)", [cse]);
      const result = await workflow.confirmImport(preview, { confirmed: true, mode: 'partial' });
      assert.equal(result.successful_count, 0); assert.equal(result.skipped_count, 1);
      assert.equal((await find('020'))[0].full_name, 'Concurrent Demo');
      assert.equal(result.row_results[0].errors[0].code, 'EXISTING_STUDENT_NUMBER');
    });

    await t.test('atomic backend conflict rolls back an earlier insert despite a valid preview', async () => {
      const rows = SAMPLE_VALID_ROWS.map((row, index) => {
        const copy = [...row]; copy[0] = String(21 + index).padStart(3,'0'); copy[2] = `${21 + index}@example.test`; return copy;
      });
      const preview = await workflow.previewFile(makeFile('xlsx',rows));
      await db.query("INSERT INTO students(student_number,full_name,email,department_id,graduation_year) VALUES ('022','Concurrent Demo','other22@example.test',$1,2027)", [cse]);
      const result = await workflow.confirmImport(preview, { confirmed: true });
      assert.equal(result.committed, false); assert.equal(result.successful_count, 0);
      assert.equal(result.skipped_count, 1); assert.equal(result.failed_count, 1);
      assert.equal((await find('021')).length, 0); assert.equal((await find('022'))[0].full_name, 'Concurrent Demo');
    });
  } finally { await db.close(); }
});
