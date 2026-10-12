import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStudentService } from '../src/services/studentBackend.js';
import { createReportService } from '../src/services/reportBackend.js';
import { sanitizeCsvCell, escapeCsvField, toCsvRow } from '../src/utils/csvSafety.js';

const student = { student_number: '0006', full_name: 'Six', email: 'six@example.test', department_code: 'CSE', graduation_year: 2027, cgpa: 10, phone: null };
const preview = { mode: 'insert_only_atomic', validation: { can_commit: true }, blocked_count: 0,
  insert_count: 1, rows: [{ action: 'insert', source_row: 2, department_id: 'untrusted-preview-id', student }] };

test('import contract forwards normalized rows and resolves department identity on the server', async () => {
  const calls = [];
  const result = { committed: true, inserted_count: 1, students: [{ source_row: 2, student_id: 'server-id' }], errors: [] };
  const service = createStudentService({ rpc: async (...args) => { calls.push(args); return { data: result, error: null }; } });
  assert.deepEqual(await service.commitStudentImport(preview, { confirmed: true }), result);
  assert.deepEqual(calls, [['commit_student_import', { p_rows: [{ source_row: 2, student }], p_confirmed: true, p_mode: 'atomic' }]]);
});
test('invalid or blocked import previews cannot issue writes', () => {
  const service = createStudentService({ rpc: () => assert.fail('Invalid preview reached database') });
  for (const invalid of [null, { ...preview, mode: 'upsert' }, { ...preview, rows: [] },
    { ...preview, validation: { can_commit: false } }, { ...preview, blocked_count: 1 },
    { ...preview, insert_count: 2 }, { ...preview, rows: [{ action: 'update', source_row: 2, student }] }]) {
    assert.throws(() => service.commitStudentImport(invalid), /Invalid insert-only import preview/);
  }
  assert.throws(() => service.commitStudentImport(preview), /Explicit import confirmation/);
  assert.throws(() => service.createStudent({ role: 'placement_incharge' }), /Invalid student fields/);
  assert.throws(() => service.updateStudent('id', { id: 'other' }), /Invalid student fields/);
});
test('import service preserves validation results and hides unexpected database details', async () => {
  const result = { committed: false, inserted_count: 0, students: [], errors: [{ code: 'CONFLICT', field: null, message: 'Duplicate student number or email.' }] };
  assert.deepEqual(await createStudentService({ rpc: async () => ({ data: result }) }).commitStudentImport(preview, { confirmed: true }), result);
  for (const [databaseCode, expectedCode] of [['42501', 'FORBIDDEN'], ['XX000', 'DATABASE_ERROR']]) {
    const service = createStudentService({ rpc: async () => ({ error: { code: databaseCode, message: 'secret SQL internal data' } }) });
    await assert.rejects(service.commitStudentImport(preview, { confirmed: true }), e => e.code === expectedCode && !e.message.includes('secret'));
  }
});
test('report service calls the snapshot RPC with exact query arguments', async () => {
  const result = { row_count: 0, rows: [], snapshot_at: '2026-10-12T10:00:00Z' };
  const calls = [];
  const service = createReportService({ rpc: async (...args) => { calls.push(args); return { data: result }; } });
  assert.deepEqual(await service.queryReportRecords({ kind: 'placement_offers', filters: { drive_statuses: ['completed'] }, student_ids: ['student'], limit: 100 }), result);
  assert.deepEqual(calls[0], ['get_report_records', { p_kind: 'placement_offers', p_filters: { drive_statuses: ['completed'] }, p_student_ids: ['student'], p_limit: 100 }]);
  await service.queryReportRecords({ kind: 'no_dues_statement' });
  assert.deepEqual(calls[1][1], { p_kind: 'no_dues_statement', p_filters: {}, p_student_ids: [], p_limit: 10000 });
});
test('report errors map to public contracts without exposing database messages', async () => {
  for (const [databaseCode, expectedCode] of [['54000', 'EXPORT_LIMIT'], ['22023', 'INVALID_INPUT'], ['42501', 'FORBIDDEN'], ['XX000', 'DATABASE_ERROR']]) {
    const service = createReportService({ rpc: async () => ({ error: { code: databaseCode, message: 'private SQL details' } }) });
    await assert.rejects(service.queryReportRecords({ kind: 'placement_summary' }), e => e.code === expectedCode && !e.message.includes('private'));
  }
  const service = createReportService({ rpc: () => assert.fail('Invalid query reached database') });
  for (const input of [{ kind: 'unknown' }, { kind: 'placement_summary', role: 'placement_incharge' },
    { kind: 'placement_summary', filters: null }, { kind: 'placement_summary', limit: 10001 },
    { kind: 'placement_summary', student_ids: [null] }]) {
    await assert.rejects(service.queryReportRecords(input), TypeError);
  }
});
test('CSV formula defense handles whitespace prefixes while preserving typed values', () => {
  for (const value of ['=SUM(A1:A2)', '  =CMD()', ' +42', ' -42', ' @formula', '\ttext', '  \rtext', '\n =formula']) {
    assert.equal(sanitizeCsvCell(value), "'" + value);
  }
  for (const [value, expected] of [[-42, '-42'], [0, '0'], [true, 'true'], [false, 'false'], ['0006', '0006'], ['Name', 'Name'], [null, '']]) {
    assert.equal(sanitizeCsvCell(value), expected);
  }
  assert.equal(escapeCsvField('Name, "Test"'), '"Name, ""Test"""');
  assert.equal(toCsvRow(['0006', 'Name', 0, true]), '0006,Name,0,true\r\n');
});
