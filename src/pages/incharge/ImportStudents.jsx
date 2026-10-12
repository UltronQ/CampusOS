import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ModulePage from '../../components/layout/ModulePage';
import DataTable from '../../components/ui/DataTable';
import StatusBadge from '../../components/ui/StatusBadge';
import Button from '../../components/ui/Button';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States';
import { IMPORT_HEADERS } from '../../features/data/contracts';
import * as studentsService from '../../services/studentsService';

/**
 * Module 1 — Validated CSV/XLSX student import (Placement In-Charge).
 *
 * Division of ownership:
 *  - Member 3 owns the parser: dynamic-imported from
 *    src/features/import/studentImport.js as validateStudentFile(file, context).
 *    If that module is not deployed yet, this page says so honestly — it never
 *    fabricates a preview or a success message.
 *  - Member 2 owns the trusted commit: studentsService.commitStudentImport
 *    calls RPC commit_student_import, which revalidates inside one transaction.
 *  - Member 1 (this file) owns file selection, template download, preview
 *    tables, error rendering and result counts.
 *
 * Atomicity: commit is insert-only and all-or-nothing, so a real commit
 * reports actual inserts on success or failed/skipped rows on rejection.
 * On atomic rejection, otherwise-valid rows are reported as skipped.
 */

const TEMPLATE_HEADERS = IMPORT_HEADERS;

/**
 * Optional-module lookup: Member 3's parser may not exist yet. import.meta.glob
 * builds cleanly with zero matches and starts using the module automatically
 * once src/features/import/studentImport.js is committed.
 */
const PARSER_PATH = '../../features/import/studentImport.js';
const parserModules = import.meta.glob('../../features/import/studentImport.js');

function buildTemplateCsv() {
  return `${TEMPLATE_HEADERS.join(',')}\r\n`;
}

function downloadTemplate() {
  const blob = new Blob([buildTemplateCsv()], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'campusos_student_import_template.csv';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function summarize(validation) {
  return {
    total: validation.total_rows,
    successful: validation.valid_rows,
    failed: validation.invalid_rows,
    blocked: validation.invalid_rows + validation.file_errors.length,
  };
}

export default function ImportStudents() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [fileName, setFileName] = useState(null);
  const [busy, setBusy] = useState(false);
  const [parserMissing, setParserMissing] = useState(null);
  const [contextError, setContextError] = useState(null);
  const [validation, setValidation] = useState(null);
  const [preview, setPreview] = useState(null);
  const [commitError, setCommitError] = useState(null);
  const [commitResult, setCommitResult] = useState(null);
  const [committing, setCommitting] = useState(false);

  async function loadParser() {
    const loader = parserModules[PARSER_PATH];
    if (!loader) {
      setParserMissing(
        new Error(
          'The import parser module (src/features/import/studentImport.js) is not available yet. ' +
            'Member 3 owns validateStudentFile — once that module is committed, file validation ' +
            'will run here. Nothing has been uploaded.',
        ),
      );
      return null;
    }
    try {
      return await loader();
    } catch (err) {
      setParserMissing(
        new Error(`The import parser failed to load: ${err?.message ?? 'unknown error'}`),
      );
      return null;
    }
  }

  async function handleFileSelect(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    // Reset all downstream state — a new file invalidates old results.
    setFileName(file.name);
    setValidation(null);
    setPreview(null);
    setCommitError(null);
    setCommitResult(null);
    setParserMissing(null);
    setContextError(null);

    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.csv') && !lower.endsWith('.xlsx')) {
      setContextError(new Error('Unsupported file type. Upload a .csv or .xlsx file.'));
      return;
    }

    setBusy(true);
    try {
      const parser = await loadParser();
      if (!parser) return;
      if (typeof parser.validateStudentFile !== 'function') {
        setParserMissing(
          new Error('The parser module does not export validateStudentFile(file, context).'),
        );
        return;
      }
      // Client preview is untrusted; Member 2's commit revalidates everything.
      const context = await studentsService.fetchImportContext();
      const result = await parser.validateStudentFile(file, context);
      setValidation(result);
      if (typeof parser.buildImportPreview === 'function') {
        setPreview(parser.buildImportPreview(result, context));
      }
    } catch (err) {
      setContextError(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleCommit() {
    if (!preview || !validation?.can_commit) return;
    setCommitting(true);
    setCommitError(null);
    setCommitResult(null);
    try {
      const result = await studentsService.commitStudentImport(preview, { confirmed: true });
      setCommitResult(result);
    } catch (err) {
      setCommitError(err);
    } finally {
      setCommitting(false);
    }
  }

  const previewColumns = [
    { key: 'source_row', label: 'Row', align: 'right' },
    { key: 'student_number', label: 'Roll number' },
    { key: 'full_name', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'department_code', label: 'Dept' },
    { key: 'graduation_year', label: 'Batch', align: 'right' },
    {
      key: '_status',
      label: 'Status',
      render: (row) =>
        row.errors.length > 0 ? (
          <StatusBadge status="rejected" />
        ) : row.warnings.length > 0 ? (
          <StatusBadge status="pending" />
        ) : (
          <StatusBadge status="cleared" />
        ),
    },
    {
      key: '_issues',
      label: 'Validation messages',
      render: (row) => {
        const messages = [
          ...row.errors.map((issue) => `${issue.code}${issue.field ? ` (${issue.field})` : ''}: ${issue.message}`),
          ...row.warnings.map((issue) => `Warning: ${issue.message}`),
        ];
        return messages.length > 0 ? (
          <ul className="space-y-0.5 text-xs text-red-700">
            {messages.map((message, index) => (
              <li key={index}>{message}</li>
            ))}
          </ul>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        );
      },
    },
  ];

  const previewRows = validation
    ? validation.rows.map((row) => ({
        ...row,
        student_number: row.normalized?.student_number ?? row.raw?.student_number ?? '',
        full_name: row.normalized?.full_name ?? row.raw?.full_name ?? '',
        email: row.normalized?.email ?? row.raw?.email ?? '',
        department_code: row.normalized?.department_code ?? row.raw?.department_code ?? '',
        graduation_year: row.normalized?.graduation_year ?? row.raw?.graduation_year ?? '',
      }))
    : [];

  return (
    <ModulePage
      title="Import Students"
      description="Upload a CSV/XLSX of student records. Rows are validated before anything is written; the commit runs in a single trusted transaction and is all-or-nothing."
    >
      <section aria-label="Template" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">1. Template</h2>
        <p className="mt-1 text-sm text-slate-500">
          Columns: <span className="font-mono text-xs">{TEMPLATE_HEADERS.join(', ')}</span>.
          The optional cgpa/phone columns may be omitted. Roll numbers must be formatted as text
          so leading zeroes survive.
        </p>
        <Button variant="secondary" onClick={downloadTemplate} className="mt-3">
          ⬇ Download CSV template
        </Button>
      </section>

      <section aria-label="File selection" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">2. Select file</h2>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx"
          onChange={handleFileSelect}
          aria-label="Choose CSV or XLSX file"
          className="mt-3 block w-full text-sm text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-indigo-700"
        />
        {fileName ? (
          <p className="mt-2 text-xs text-slate-500">
            Selected: <span className="font-medium">{fileName}</span>
          </p>
        ) : null}
      </section>

      {busy ? <LoadingState label="Validating file…" /> : null}

      {parserMissing ? <ErrorState title="Parser not available yet" error={parserMissing} /> : null}
      {contextError ? <ErrorState title="Could not validate file" error={contextError} /> : null}

      {validation ? (
        <section aria-label="Preview" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">3. Preview &amp; validation</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg bg-slate-50 p-3">
              <dt className="text-xs text-slate-500">Total rows</dt>
              <dd className="text-lg font-semibold text-slate-900">{summarize(validation).total}</dd>
            </div>
            <div className="rounded-lg bg-emerald-50 p-3">
              <dt className="text-xs text-emerald-700">Valid (would insert)</dt>
              <dd className="text-lg font-semibold text-emerald-800">{summarize(validation).successful}</dd>
            </div>
            <div className="rounded-lg bg-red-50 p-3">
              <dt className="text-xs text-red-700">Invalid (block import)</dt>
              <dd className="text-lg font-semibold text-red-800">{summarize(validation).failed}</dd>
            </div>
            <div className="rounded-lg bg-amber-50 p-3">
              <dt className="text-xs text-amber-700">Warning rows</dt>
              <dd className="text-lg font-semibold text-amber-800">{validation.warning_rows}</dd>
            </div>
          </dl>

          {validation.file_errors.length > 0 ? (
            <div className="mt-4">
              <ErrorState title="File-level errors — import blocked">
                <ul className="mt-2 space-y-1 text-left text-xs">
                  {validation.file_errors.map((issue, index) => (
                    <li key={index}>
                      <span className="font-mono">{issue.code}</span>: {issue.message}
                    </li>
                  ))}
                </ul>
              </ErrorState>
            </div>
          ) : null}

          <div className="mt-4">
            <DataTable
              columns={previewColumns}
              rows={previewRows}
              caption="Import preview with validation results"
              rowKey={(row) => row.source_row}
              emptyTitle="File contains no data rows"
              emptyMessage="The file parsed successfully but has no student rows."
            />
          </div>

          <div className="mt-4 flex items-center justify-between gap-4">
            <p className="text-xs text-slate-500">
              {validation.can_commit
                ? 'All rows valid. Committing writes every row in one transaction — if anything fails, nothing is written.'
                : 'Import is blocked: fix every invalid row and re-upload. No rows will be written.'}
            </p>
            <Button onClick={handleCommit} disabled={!validation.can_commit} busy={committing}>
              Commit {preview?.insert_count ?? 0} students
            </Button>
          </div>
        </section>
      ) : null}

      {commitError ? <ErrorState title="Import commit failed — nothing was written" error={commitError} /> : null}

      {commitResult ? (
        <section aria-label="Commit result" className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <h2 className="text-base font-semibold text-emerald-900">
            {commitResult.committed ? 'Import committed' : 'Import rejected'}
          </h2>
          <dl className="mt-3 grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-white p-3">
              <dt className="text-xs text-slate-500">Successful rows</dt>
              <dd className="text-lg font-semibold text-emerald-800">{commitResult.successful_count}</dd>
            </div>
            <div className="rounded-lg bg-white p-3">
              <dt className="text-xs text-slate-500">Failed rows</dt>
              <dd className="text-lg font-semibold text-red-700">
                {commitResult.failed_count}
              </dd>
            </div>
            <div className="rounded-lg bg-white p-3">
              <dt className="text-xs text-slate-500">Skipped rows</dt>
              <dd className="text-lg font-semibold text-slate-700">{commitResult.skipped_count}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-emerald-800">
            Counts come from the database. This page uses atomic imports: if a row fails,
            no students are inserted and the remaining valid rows are skipped.
          </p>
          {commitResult.row_results.filter((row) => row.status !== 'successful').map((row) => (
            <p key={row.source_row} className="mt-2 text-sm text-red-700">
              Row {row.source_row}: {row.errors.map((issue) => `${issue.field ? `${issue.field}: ` : ''}${issue.message}`).join(' ')}
            </p>
          ))}
          {commitResult.committed ? (
            <Button variant="secondary" className="mt-3" onClick={() => navigate('/incharge/students')}>
              View students directory →
            </Button>
          ) : null}
        </section>
      ) : null}

      {!busy && !validation && !parserMissing && !contextError ? (
        <EmptyState title="No file selected yet">
          Download the template, fill in your student records, then select the file above.
          You will see a full preview with row-level validation before anything is written.
        </EmptyState>
      ) : null}
    </ModulePage>
  );
}
