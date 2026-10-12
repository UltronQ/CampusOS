import { parseStudentFile } from './fileParsing.js';
import { assertImportContext, validateStudentRows } from './studentValidation.js';
import { buildImportPreview, confirmImportPreview } from './importPreview.js';

export { parseStudentFile, validateStudentRows, buildImportPreview, confirmImportPreview };
export { getStudentImportTemplate, downloadImportTemplate } from './studentTemplates.js';

export async function validateStudentFile(file, context) {
  assertImportContext(context);
  return validateStudentRows(await parseStudentFile(file, context), context);
}

/** Clean Member 1 integration: read -> preview -> explicit confirmation -> write. */
export function createStudentImportService(backend) {
  const issued = new WeakSet();
  const pending = new WeakSet();
  return {
    async previewFile(file, { mode = 'atomic' } = {}) {
      const context = await backend.fetchImportContext();
      const validation = await validateStudentFile(file, context);
      const preview = buildImportPreview(validation, context, { mode });
      issued.add(preview);
      return preview;
    },
    async confirmImport(preview, options) {
      if (!issued.has(preview)) throw new Error('Prepare a preview with this import service first.');
      if (pending.has(preview)) throw new Error('This preview is already being imported.');
      pending.add(preview);
      try {
        const result = await confirmImportPreview(preview, backend, options);
        issued.delete(preview);
        return result;
      } finally { pending.delete(preview); }
    },
  };
}
