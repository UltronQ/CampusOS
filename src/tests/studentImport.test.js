import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { validateStudentFile, parseStudentFile, buildImportPreview, createStudentImportService } from '../features/import/studentImport.js';
import { getStudentImportTemplate } from '../features/import/studentTemplates.js';
import { IMPORT_HEADERS } from '../features/data/contracts.js';
import { importContext } from './fixtures/data-contracts.fixture.js';

const headers = [...IMPORT_HEADERS];
const good = ['006','Demo Student Six','six@example.test','CSE','2027','8.50','+91 90000 00006','0'];
const fileFrom = (text, name = 'students.csv') => new File([text], name);
const csv = (rows, names = headers) => fileFrom(Papa.unparse([names, ...rows], { newline: '\r\n' }));
function workbookFile(rows, names = headers, change = () => {}) {
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([names, ...rows]);
  change(sheet, book);
  XLSX.utils.book_append_sheet(book, sheet, 'Students');
  return new File([XLSX.write(book, { type: 'array', bookType: 'xlsx' })], 'students.xlsx');
}
const errors = (result, code) => result.rows.flatMap((row) => row.errors).filter((issue) => issue.code === code);

for (const format of ['csv','xlsx']) {
  const make = (rows, names = headers) => format === 'csv' ? csv(rows, names) : workbookFile(rows, names);
  test(`${format}: validates required fields, preserves identifiers and previews without writes`, async () => {
    const validation = await validateStudentFile(make([good]), importContext);
    assert.equal(validation.can_commit, true); assert.equal(validation.valid_rows, 1);
    assert.equal(validation.rows[0].source_row, 2);
    assert.deepEqual(validation.rows[0].normalized, {
      student_number: '006', full_name: 'Demo Student Six', email: 'six@example.test',
      department_code: 'CSE', graduation_year: 2027, cgpa: 8.5, phone: '+91 90000 00006', backlogs: 0,
    });
    const preview = buildImportPreview(validation, importContext);
    assert.equal(preview.rows[0].department_id, 'cse'); assert.equal(preview.can_commit, true);
    assert.ok(Object.isFrozen(preview)); assert.ok(Object.isFrozen(preview.rows[0].student));
  });
  test(`${format}: missing columns and duplicate/unknown headers block every mode`, async () => {
    const missing = await validateStudentFile(make([good.slice(1)], headers.slice(1)), importContext);
    assert.ok(missing.file_errors.some((issue) => issue.code === 'MISSING_HEADER' && issue.field === 'student_number'));
    assert.equal(missing.can_commit_partial, false);
    const duplicate = await validateStudentFile(make([good], [...headers.slice(0, 7),'email']), importContext);
    assert.ok(duplicate.file_errors.some((issue) => issue.code === 'DUPLICATE_HEADER'));
    const unknown = await validateStudentFile(make([[...good,'no']], [...headers,'role']), importContext);
    assert.ok(unknown.file_errors.some((issue) => issue.code === 'UNKNOWN_HEADER'));
  });
  test(`${format}: missing roll numbers and malformed emails report exact rows`, async () => {
    const badRoll = [...good]; badRoll[0] = ' ';
    const badEmail = [...good]; badEmail[0] = '007'; badEmail[2] = 'bad-email';
    const validation = await validateStudentFile(make([badRoll,badEmail]), importContext);
    assert.equal(validation.invalid_rows, 2); assert.equal(validation.can_commit, false);
    assert.equal(validation.rows[0].source_row, 2); assert.equal(validation.rows[1].source_row, 3);
    assert.ok(validation.rows[0].errors.some((issue) => issue.code === 'REQUIRED' && issue.field === 'student_number'));
    assert.ok(validation.rows[1].errors.some((issue) => issue.code === 'INVALID_EMAIL'));
  });
  test(`${format}: marks all file duplicate groups and detects existing database identities`, async () => {
    const second = [...good]; second[2] = 'other@example.test';
    const duplicate = await validateStudentFile(make([good,second]), importContext);
    assert.equal(errors(duplicate,'DUPLICATE_STUDENT_NUMBER').length, 2);
    const emailDuplicate = [...good]; emailDuplicate[0] = '007'; emailDuplicate[2] = ' SIX@EXAMPLE.TEST ';
    assert.equal(errors(await validateStudentFile(make([good,emailDuplicate]), importContext),'DUPLICATE_EMAIL').length, 2);
    const existing = [...good]; existing[0] = '001'; existing[2] = ' ONE@EXAMPLE.TEST ';
    const validation = await validateStudentFile(make([existing]), importContext);
    assert.equal(errors(validation,'EXISTING_STUDENT_NUMBER').length, 1);
    assert.equal(errors(validation,'EXISTING_EMAIL').length, 1);
  });
  test(`${format}: validates year, CGPA, backlog, phone and department formats`, async () => {
    for (const [index, value, code] of [[4,'2027.5','INVALID_YEAR'],[4,'2031','INVALID_YEAR'],
      [5,'NaN','INVALID_CGPA'],[5,'10.01','INVALID_CGPA'],[5,'8.555','INVALID_CGPA'],
      [7,'-1','INVALID_BACKLOGS'],[7,'1.5','INVALID_BACKLOGS'],[6,'123','INVALID_PHONE'],[3,'UNKNOWN','UNKNOWN_DEPARTMENT']]) {
      const row = [...good]; row[index] = value;
      assert.ok(errors(await validateStudentFile(make([row]), importContext),code).length, `${index}: ${value}`);
    }
    const maximum = [...good]; maximum[5] = '10.00';
    assert.equal((await validateStudentFile(make([maximum]), importContext)).can_commit, true);
  });
  test(`${format}: optional fields and backend registration extensions normalize correctly`, async () => {
    const minimal = await validateStudentFile(make([good.slice(0,5)], headers.slice(0,5)), importContext);
    assert.equal(minimal.can_commit, true); assert.equal(minimal.rows[0].normalized.cgpa, null);
    const names = [...headers,'program','academic_year','section','placement_registered','eligibility_status'];
    const extended = await validateStudentFile(make([[...good,' B.Tech ','4',' A ','TRUE','eligible']], names), importContext);
    assert.equal(extended.can_commit, true); assert.equal(extended.rows[0].normalized.placement_registered, true);
    assert.equal(extended.rows[0].normalized.program, 'B.Tech');
  });
}

test('CSV quoted commas/newlines and blank rows preserve physical line numbers', async () => {
  const text = headers.join(',') + '\r\n006,"Demo,\r\nStudent",six@example.test,CSE,2027,8.5,,0\r\n\r\n007,Demo,bad-email,ECE,2027,9,,0\r\n';
  const validation = await validateStudentFile(fileFrom(text), importContext);
  assert.deepEqual(validation.rows.map((row) => row.source_row), [2,5]);
  assert.equal(validation.rows[0].normalized.full_name, 'Demo,\r\nStudent');
  assert.equal(validation.rows[1].errors[0].code, 'INVALID_EMAIL');
});

test('CSV malformed quoting, extra/missing cells, binary input and size/row limits block imports', async () => {
  assert.ok((await validateStudentFile(fileFrom(headers.join(',') + '\n"unclosed'), importContext)).file_errors.some((e) => e.code === 'PARSE_ERROR'));
  assert.ok(errors(await validateStudentFile(csv([[...good,'extra']]), importContext),'COLUMN_COUNT').length);
  assert.ok(errors(await validateStudentFile(csv([good.slice(0,5)]), importContext),'COLUMN_COUNT').length);
  assert.equal((await parseStudentFile(fileFrom('\0binary'))).file_errors[0].code, 'INVALID_ENCODING');
  const invalidUtf8 = new File([new Uint8Array([0xff,0xfe,0x00])], 'bad.csv');
  assert.equal((await parseStudentFile(invalidUtf8)).file_errors[0].code, 'INVALID_ENCODING');
  const limited = await validateStudentFile(csv([good,good]), { ...importContext, max_rows: 1 });
  assert.ok(limited.file_errors.some((e) => e.code === 'ROW_LIMIT'));
  assert.equal((await parseStudentFile(fileFrom('12345'), { max_bytes: 2 })).file_errors[0].code, 'FILE_SIZE_LIMIT');
});

test('Excel rejects numeric identifiers, formulas and error cells; sparse blank rows keep worksheet positions', async () => {
  const numeric = [...good]; numeric[0] = 6; numeric[6] = 9000000006;
  const result = await validateStudentFile(workbookFile([numeric]), importContext);
  assert.equal(errors(result,'IDENTIFIER_NOT_TEXT').length, 2);
  const formulas = workbookFile([good], headers, (sheet) => { sheet.B2 = { t: 's', v: 'Demo', f: '"Demo"' }; sheet.C2 = { t: 'e', v: 15 }; });
  const rejected = await validateStudentFile(formulas, importContext);
  assert.equal(errors(rejected,'FORMULA_CELL').length, 1); assert.equal(errors(rejected,'EXCEL_ERROR').length, 1);
  const sparse = workbookFile([good,[],[...good.slice(0,2),'bad-email',...good.slice(3)]], headers);
  assert.deepEqual((await validateStudentFile(sparse, importContext)).rows.map((row) => row.source_row), [2,4]);
});

test('empty, header-only, unsupported and multi-sheet files never produce committable previews', async () => {
  assert.equal((await validateStudentFile(fileFrom(''), importContext)).can_commit, false);
  assert.ok((await validateStudentFile(csv([]), importContext)).file_errors.some((e) => e.code === 'EMPTY_FILE'));
  assert.equal((await parseStudentFile(fileFrom('text','students.xls'))).file_errors[0].code, 'UNSUPPORTED_FILE');
  assert.equal((await parseStudentFile(fileFrom('text','renamed.xlsx'))).file_errors[0].code, 'PARSE_ERROR');
  const multiple = workbookFile([good], headers, (_sheet, book) => XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([headers,good]), 'Other'));
  assert.ok((await validateStudentFile(multiple, importContext)).file_errors.some((e) => e.code === 'MULTIPLE_SHEETS'));
  await assert.rejects(validateStudentFile(csv([good]), { ...importContext, existing_students: undefined }));
});

test('sample templates are real files with exact columns and text Excel identifiers', async () => {
  for (const format of ['csv','xlsx']) {
    const template = getStudentImportTemplate(format);
    const validation = await validateStudentFile(new File([template.blob], template.filename), importContext);
    assert.equal(validation.can_commit, true); assert.equal(validation.total_rows, 2);
    const blank = getStudentImportTemplate(format, { include_examples: false });
    const parsed = await parseStudentFile(new File([blank.blob], blank.filename));
    assert.deepEqual(parsed.headers, headers);
  }
  const book = XLSX.read(await getStudentImportTemplate('xlsx').blob.arrayBuffer(), { type: 'array' });
  assert.equal(book.Sheets.Students.A2.t, 's'); assert.equal(book.Sheets.Students.A2.v, '006');
  for (const format of ['csv','xlsx']) {
    const validBytes = await readFile(new URL(`../../public/import/students-valid.${format}`, import.meta.url));
    assert.equal((await validateStudentFile(new File([validBytes], `valid.${format}`), importContext)).can_commit, true);
    const invalidBytes = await readFile(new URL(`../../public/import/students-invalid.${format}`, import.meta.url));
    const invalid = await validateStudentFile(new File([invalidBytes], `invalid.${format}`), importContext);
    assert.equal(invalid.total_rows, 6); assert.equal(invalid.valid_rows, 1); assert.equal(invalid.duplicate_rows, 3);
  }
});

test('workflow preview is read-only; confirmation, mode and repeated submission are enforced', async () => {
  let writes = 0;
  const backend = {
    fetchImportContext: async () => importContext,
    commitStudentImport: async (preview) => {
      writes++;
      return { committed: true, students: [{ source_row: 2, student_id: 'inserted' }],
        inserted_count: 1, successful_count: 1, failed_count: 0, skipped_count: 0, duplicate_count: 0,
        total_count: 1, errors: [], history_id: 'history', row_results: [{ source_row: 2, status: 'successful', student_id: 'inserted', errors: [] }] };
    },
  };
  const service = createStudentImportService(backend);
  const preview = await service.previewFile(csv([good]));
  assert.equal(writes, 0);
  await assert.rejects(service.confirmImport(preview, { confirmed: false })); assert.equal(writes, 0);
  await assert.rejects(service.confirmImport(preview, { confirmed: true, mode: 'partial' })); assert.equal(writes, 0);
  const result = await service.confirmImport(preview, { confirmed: true });
  assert.equal(writes, 1); assert.equal(result.successful_count, 1);
  await assert.rejects(service.confirmImport(preview, { confirmed: true })); assert.equal(writes, 1);
});
