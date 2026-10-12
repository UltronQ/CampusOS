import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const blank = (value) => value === undefined || value === null || String(value).trim() === '';
const issue = (code, message, source_row = null) => ({ code, field: null, message, source_row });

function parseCsv(text, maxRows) {
  text = text.replace(/^\uFEFF/, '');
  const records = [];
  const file_errors = [];
  let cursor = 0;
  let line = 1;
  let truncated = false;
  Papa.parse(text, {
    delimiter: ',', header: false, dynamicTyping: false, skipEmptyLines: false,
    step(result, parser) {
      const source_row = line;
      const segment = text.slice(cursor, result.meta.cursor);
      line += (segment.match(/\r\n|\r|\n/g) ?? []).length;
      cursor = result.meta.cursor;
      for (const error of result.errors) file_errors.push(issue('PARSE_ERROR', `Row ${source_row}: ${error.message}`, source_row));
      if (!result.data.every(blank)) {
        records.push({ source_row, cells: result.data, cell_errors: [] });
        if (records.length > maxRows + 1) {
          truncated = true;
          file_errors.push(issue('ROW_LIMIT', `File exceeds ${maxRows} data rows. Parsing stopped; no rows can be imported.`));
          parser.abort();
        }
      }
    },
  });
  return { records, file_errors, truncated, sheet_name: null, format: 'csv' };
}

function parseWorkbook(bytes, maxRows) {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('The .xlsx file is not an Excel workbook.');
  const book = XLSX.read(bytes, { type: 'array', cellFormula: true, cellDates: false });
  const nonempty = [];
  for (const name of book.SheetNames) {
    const sheet = book.Sheets[name];
    const byRow = new Map();
    // Sparse cell traversal preserves worksheet row numbers without allocating
    // millions of empty rows from a misleading worksheet used-range.
    for (const [address, cell] of Object.entries(sheet)) {
      if (address.startsWith('!') || (!cell.f && blank(cell.v))) continue;
      const { r, c } = XLSX.utils.decode_cell(address);
      if (c > 127) throw new Error('Workbook contains data beyond the supported 128 columns.');
      if (!byRow.has(r)) byRow.set(r, { source_row: r + 1, cells: [], cell_errors: [] });
      const record = byRow.get(r);
      record.cells[c] = cell.v ?? '';
      if (cell.f) record.cell_errors.push({ column: c, code: 'FORMULA_CELL', message: 'Formula cells are not permitted. Paste the value as text or a number.' });
      else if (cell.t === 'e') record.cell_errors.push({ column: c, code: 'EXCEL_ERROR', message: 'Excel error cell must be corrected.' });
    }
    if (byRow.size) nonempty.push({ name, records: [...byRow.values()].sort((a, b) => a.source_row - b.source_row) });
  }
  if (!nonempty.length) return { records: [], file_errors: [], truncated: false, sheet_name: null, format: 'xlsx' };
  const file_errors = [];
  if (nonempty.length > 1) file_errors.push(issue('MULTIPLE_SHEETS', 'Use one nonempty worksheet. Additional worksheets cannot be silently ignored.'));
  let records = nonempty[0].records;
  const truncated = records.length > maxRows + 1;
  if (truncated) {
    file_errors.push(issue('ROW_LIMIT', `Workbook exceeds ${maxRows} data rows. No rows can be imported.`));
    records = records.slice(0, maxRows + 2);
  }
  return { records, file_errors, truncated, sheet_name: nonempty[0].name, format: 'xlsx' };
}

/** Parse only. No database writes or authentication side effects. */
export async function parseStudentFile(file, { max_rows = 1000, max_bytes = MAX_IMPORT_BYTES } = {}) {
  const empty = { headers: [], rows: [], file_errors: [], sheet_name: null, truncated: false, filename: file?.name ?? '' };
  if (!file || typeof file.name !== 'string' || typeof file.arrayBuffer !== 'function') {
    return { ...empty, file_errors: [issue('INVALID_FILE', 'Choose a CSV or XLSX file.')] };
  }
  const extension = file.name.split('.').at(-1).toLowerCase();
  if (!['csv', 'xlsx'].includes(extension)) return { ...empty, file_errors: [issue('UNSUPPORTED_FILE', 'Only .csv and .xlsx files are supported.')] };
  if (file.size > max_bytes) return { ...empty, file_errors: [issue('FILE_SIZE_LIMIT', `File must be no larger than ${max_bytes} bytes.`)] };
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength > max_bytes) return { ...empty, file_errors: [issue('FILE_SIZE_LIMIT', 'File exceeds the size limit.')] };
    let parsed;
    if (extension === 'csv') {
      let text;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
      catch { return { ...empty, file_errors: [issue('INVALID_ENCODING', 'Save the CSV as UTF-8.')] }; }
      if (text.includes('\0')) return { ...empty, file_errors: [issue('INVALID_ENCODING', 'CSV contains binary/null characters. Save as UTF-8 text.')] };
      parsed = parseCsv(text, max_rows);
    } else parsed = parseWorkbook(bytes, max_rows);
    const [header, ...rows] = parsed.records;
    const file_errors = [...parsed.file_errors];
    if (!header || rows.length === 0) file_errors.push(issue('EMPTY_FILE', 'File must contain a header and at least one student row.'));
    for (const error of header?.cell_errors ?? []) file_errors.push(issue(error.code, `Header column ${error.column + 1}: ${error.message}`, header.source_row));
    return { ...empty, ...parsed, records: undefined, headers: header?.cells ?? [], rows, file_errors };
  } catch {
    return { ...empty, file_errors: [issue('PARSE_ERROR', 'File could not be read. Check that it is a valid, unencrypted CSV/XLSX file.')] };
  }
}
