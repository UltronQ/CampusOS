import { assertImportContext } from './studentValidation.js';

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

export function buildImportPreview(validation, context, { mode = 'atomic' } = {}) {
  assertImportContext(context);
  if (!['atomic','partial'].includes(mode)) throw new Error('Import mode must be atomic or partial.');
  const snapshot = structuredClone(validation);
  const ids = new Map(context.departments.map((department) => [department.code.trim().toUpperCase(), department.id]));
  const rows = snapshot.rows.filter((row) => !row.errors.length).map((row) => ({
    source_row: row.source_row, action: 'insert', student: row.normalized,
    department_id: ids.get(row.normalized.department_code),
  }));
  return freeze({ validation: snapshot, rows, insert_count: rows.length, blocked_count: snapshot.invalid_rows,
    mode: mode === 'atomic' ? 'insert_only_atomic' : 'insert_only_partial',
    can_commit: mode === 'atomic' ? snapshot.can_commit : snapshot.can_commit_partial });
}

/**
 * Persist eligible rows only after confirmation. Local invalid/duplicate rows
 * never reach persistence; merge their outcomes with actual backend results.
 * backend_counts explicitly identifies the submitted-only audit summary.
 */
export async function confirmImportPreview(preview, backend, { confirmed = false, mode = 'atomic' } = {}) {
  if (confirmed !== true) throw Object.assign(new Error('Explicit confirmation is required.'), { code: 'INVALID_INPUT' });
  const expectedMode = mode === 'atomic' ? 'insert_only_atomic' : mode === 'partial' ? 'insert_only_partial' : null;
  if (!preview || preview.mode !== expectedMode || !preview.can_commit || preview.validation.file_errors.length) {
    throw Object.assign(new Error('This preview is blocked or its mode changed. Validate the file again.'), { code: 'INVALID_INPUT' });
  }
  if (typeof backend?.commitStudentImport !== 'function') throw new Error('A real backend import persistence service is required.');
  const result = await backend.commitStudentImport(preview, { confirmed: true, mode });
  const requestedRows = new Set(preview.rows.map((row) => row.source_row));
  if (!result || !Array.isArray(result.row_results) || !Array.isArray(result.errors)
    || result.total_count !== preview.rows.length || result.row_results.length !== preview.rows.length
    || new Set(result.row_results.map((row) => row.source_row)).size !== requestedRows.size
    || result.row_results.some((row) => !requestedRows.has(row.source_row) || !Array.isArray(row.errors) || !['successful','skipped','failed'].includes(row.status))) {
    throw new Error('Incomplete persistence response. Refresh the directory before retrying.');
  }
  const rejected = preview.validation.rows.filter((row) => row.errors.length).map((row) => {
    const onlyDuplicates = row.errors.every((error) => /^(DUPLICATE|EXISTING)_/.test(error.code));
    return { source_row: row.source_row, status: onlyDuplicates ? 'skipped' : 'failed', errors: row.errors };
  });
  const row_results = [...result.row_results, ...rejected].sort((a, b) => a.source_row - b.source_row);
  const counts = { successful: 0, skipped: 0, failed: 0 };
  for (const row of row_results) counts[row.status]++;
  return {
    ...result,
    successful_count: counts.successful, skipped_count: counts.skipped, failed_count: counts.failed,
    total_count: preview.validation.total_rows,
    duplicate_count: result.duplicate_count + preview.validation.duplicate_rows,
    row_results,
    errors: [...result.errors, ...rejected.flatMap((row) => row.errors.map((error) => ({ ...error, source_row: row.source_row })))],
    backend_counts: { total_count: result.total_count, successful_count: result.successful_count,
      skipped_count: result.skipped_count, failed_count: result.failed_count, history_id: result.history_id },
    local_rejected_count: rejected.length,
  };
}
