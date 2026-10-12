import { mkdir, writeFile } from 'node:fs/promises';
import { getStudentImportTemplate, SAMPLE_VALID_ROWS, SAMPLE_INVALID_ROWS } from '../src/features/import/studentTemplates.js';

const output = new URL('../public/import/', import.meta.url);
await mkdir(output, { recursive: true });
const formats = process.argv.includes('--csv-only') ? ['csv'] : ['csv','xlsx'];
for (const [name, rows] of [['student-template', SAMPLE_VALID_ROWS], ['students-valid', SAMPLE_VALID_ROWS], ['students-invalid', SAMPLE_INVALID_ROWS]]) {
  for (const format of formats) {
    const { blob } = getStudentImportTemplate(format, { rows });
    await writeFile(new URL(`${name}.${format}`, output), new Uint8Array(await blob.arrayBuffer()));
  }
}
console.log('Student import templates and samples generated.');
