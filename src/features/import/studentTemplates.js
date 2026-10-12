import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { IMPORT_HEADERS } from '../data/contracts.js';
import { SAMPLE_VALID_ROWS } from './sampleRecords.js';
export { SAMPLE_VALID_ROWS, SAMPLE_INVALID_ROWS } from './sampleRecords.js';

/** Actual downloadable CSV/XLSX blobs. Uses the same schema as the parser. */
export function getStudentImportTemplate(format = 'csv', { include_examples = true, rows = null, filename = null } = {}) {
  const matrix = [Array.from(IMPORT_HEADERS), ...(rows ?? (include_examples ? SAMPLE_VALID_ROWS : []))];
  let blob;
  if (format === 'csv') {
    blob = new Blob(['\uFEFF', Papa.unparse(matrix, { newline: '\r\n', quotes: true }), '\r\n'], { type: 'text/csv;charset=utf-8' });
  } else if (format === 'xlsx') {
    const book = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet(matrix);
    sheet['!cols'] = IMPORT_HEADERS.map((header, index) => ({ wch: index === 2 ? 32 : index === 1 ? 25 : Math.max(header.length + 2, 18) }));
    // Text identifiers are stored as string cells; Excel cannot lose zeroes.
    for (let r = 1; r < matrix.length; r++) {
      for (const c of [0, 6]) {
        const address = XLSX.utils.encode_cell({ r, c });
        if (sheet[address]) { sheet[address].t = 's'; sheet[address].v = String(matrix[r][c] ?? ''); sheet[address].z = '@'; }
      }
    }
    XLSX.utils.book_append_sheet(book, sheet, 'Students');
    blob = new Blob([XLSX.write(book, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  } else throw new Error('Template format must be csv or xlsx.');
  return { filename: filename ?? `campusos_student_import_template.${format}`, blob, mime_type: blob.type };
}

export function downloadImportTemplate(format = 'csv') {
  const result = getStudentImportTemplate(format);
  const url = URL.createObjectURL(result.blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = result.filename;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
