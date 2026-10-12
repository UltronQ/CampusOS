import { useRef, useState } from 'react';
import ModulePage from '../../components/layout/ModulePage';
import DataTable from '../../components/ui/DataTable';
import Button from '../../components/ui/Button';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States';
import { IMPORT_HEADERS } from '../../features/data/contracts';
import * as backend from '../../services/studentsService';

// Parsing is lazy-loaded. Persistence is always Member 2's authorized service.
const loadEngine = () => import('../../features/import/studentImport.js');
const columns = [
  { key: 'source_row', label: 'File row' },
  { key: 'student_number', label: 'Roll number', render: (row) => row.normalized?.student_number ?? row.raw.student_number },
  { key: 'full_name', label: 'Name', render: (row) => row.normalized?.full_name ?? row.raw.full_name },
  { key: 'email', label: 'Email', render: (row) => row.normalized?.email ?? row.raw.email },
  { key: 'department_code', label: 'Department', render: (row) => row.normalized?.department_code ?? row.raw.department_code },
  { key: 'graduation_year', label: 'Batch', render: (row) => row.normalized?.graduation_year ?? row.raw.graduation_year },
  { key: 'errors', label: 'Validation', render: (row) => row.errors.length ? (
    <ul className="space-y-1 text-xs text-red-700">
      {row.errors.map((issue, index) => <li key={index}>{issue.field ? issue.field + ': ' : ''}{issue.message}</li>)}
    </ul>
  ) : <span className="text-emerald-700">Ready</span> },
];

export default function ImportStudents() {
  const workflow = useRef(null);
  const selectedFile = useRef(null);
  const request = useRef(0);
  const [preview, setPreview] = useState(null);
  const [mode, setMode] = useState('atomic');
  const [busy, setBusy] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [templateBusy, setTemplateBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function getWorkflow() {
    if (!workflow.current) workflow.current = (await loadEngine()).createStudentImportService(backend);
    return workflow.current;
  }
  async function prepare(file, chosenMode = mode) {
    const revision = ++request.current;
    selectedFile.current = file;
    setPreview(null); setResult(null); setError(null); setConfirmOpen(false); setBusy(true);
    try {
      const next = await (await getWorkflow()).previewFile(file, { mode: chosenMode });
      if (revision === request.current) setPreview(next);
    } catch (failure) { if (revision === request.current) setError(failure); }
    finally { if (revision === request.current) setBusy(false); }
  }
  async function downloadTemplate(format) {
    setTemplateBusy(true); setError(null);
    try { (await loadEngine()).downloadImportTemplate(format); }
    catch (failure) { setError(failure); }
    finally { setTemplateBusy(false); }
  }
  async function changeMode(event) {
    const nextMode = event.target.checked ? 'partial' : 'atomic';
    setMode(nextMode); setConfirmOpen(false);
    if (selectedFile.current) await prepare(selectedFile.current, nextMode);
  }
  async function confirmImport() {
    if (!preview?.can_commit || committing) return;
    setCommitting(true); setError(null);
    try {
      setResult(await (await getWorkflow()).confirmImport(preview, { confirmed: true, mode }));
    } catch (failure) { setError(failure); }
    finally { setCommitting(false); setConfirmOpen(false); }
  }
  const validation = preview?.validation;

  return (
    <ModulePage title="Import Students" description="Preview student records, correct errors, then confirm the import. Existing students are never overwritten.">
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold">1. Download a template</h2>
        <p className="mt-2 text-sm text-slate-600">
          Templates contain fictional example rows. Replace them with your records.
          Required columns: {IMPORT_HEADERS.slice(0, 5).join(', ')}.
          CGPA, phone and backlogs are optional. Format roll numbers and phone numbers as text.
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <Button variant="secondary" busy={templateBusy} onClick={() => downloadTemplate('csv')}>Download CSV template</Button>
          <Button variant="secondary" busy={templateBusy} onClick={() => downloadTemplate('xlsx')}>Download Excel template</Button>
          <a className="self-center text-sm text-indigo-700 underline" href="/import/students-valid.csv" download>Valid CSV sample</a>
          <a className="self-center text-sm text-indigo-700 underline" href="/import/students-invalid.xlsx" download>Invalid Excel sample</a>
        </div>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold">2. Select a CSV or Excel file</h2>
        <label className="mt-3 flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={mode === 'partial'} onChange={changeMode} disabled={busy || committing} className="mt-1" />
          <span>Import only valid rows. Invalid rows and duplicates will be excluded.
            Leave unchecked to require every row to be valid.</span>
        </label>
        <input type="file" accept=".csv,.xlsx" aria-label="Choose student import file"
          disabled={busy || committing} className="mt-4 block w-full text-sm"
          onClick={(event) => { event.currentTarget.value = ''; }}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) prepare(file);
          }} />
        <p className="mt-2 text-xs text-slate-500">UTF-8 CSV or .xlsx, up to 5 MB. Use one nonempty worksheet.</p>
      </section>
      {busy ? <LoadingState label="Parsing and validating student records…" /> : null}
      {error ? <ErrorState title="Import could not continue" error={error}>
        Review the message and refresh the student directory before retrying an uncertain commit.
      </ErrorState> : null}
      {validation ? (
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold">3. Preview: {validation.filename}</h2>
          {validation.sheet_name ? <p className="text-sm text-slate-600">Worksheet: {validation.sheet_name}</p> : null}
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[['Parsed rows', validation.total_rows], ['Ready rows', validation.valid_rows],
              ['Rejected rows', validation.invalid_rows], ['Duplicate rows', validation.duplicate_rows]].map(([label, count]) => (
              <div key={label} className="rounded-lg bg-slate-50 p-3">
                <dt className="text-xs text-slate-600">{label}</dt><dd className="text-xl font-semibold">{count}</dd>
              </div>
            ))}
          </dl>
          {validation.file_errors.length ? (
            <ErrorState title="File errors block every import mode">
              <ul className="mt-2 space-y-1 text-left">
                {validation.file_errors.map((issue, index) => <li key={index}>{issue.field ? issue.field + ': ' : ''}{issue.message}</li>)}
              </ul>
            </ErrorState>
          ) : null}
          <DataTable columns={columns} rows={validation.rows} rowKey={(row) => row.source_row}
            caption="Student import preview with physical file row numbers" emptyTitle="No student rows" />
          <p className="text-sm text-slate-600">
            {preview.can_commit
              ? mode === 'atomic'
                ? 'Every row is ready. The database will import all rows or roll back the entire batch.'
                : preview.insert_count + ' ready ' + (preview.insert_count === 1 ? 'row' : 'rows') + ' will be submitted; ' + preview.blocked_count + ' rejected rows will not be imported.'
              : 'Correct the file errors or invalid rows before confirming. No rows have been written.'}
          </p>
          <Button onClick={() => setConfirmOpen(true)} disabled={!preview.can_commit || Boolean(result)} busy={committing}>
            Review and confirm {preview.insert_count} {preview.insert_count === 1 ? 'student' : 'students'}
          </Button>
        </section>
      ) : null}
      <ConfirmDialog open={confirmOpen} onClose={() => setConfirmOpen(false)} onConfirm={confirmImport}
        title="Confirm student import" confirmLabel="Confirm import" busy={committing}
        message={preview ? 'Import ' + preview.insert_count + ' ready ' + (preview.insert_count === 1 ? 'student' : 'students') + ' from ' + preview.validation.filename + '? ' +
          (mode === 'partial' ? preview.blocked_count + ' rejected rows will be excluded. ' : 'This is an all-or-nothing import. ') +
          'Existing records will never be overwritten.' : ''} />
      {result ? (
        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold">{result.committed ? 'Import completed' : 'No students imported'}</h2>
          <dl className="grid grid-cols-3 gap-3">
            {[['Successful', result.successful_count], ['Skipped', result.skipped_count], ['Failed', result.failed_count]].map(([label, count]) => (
              <div key={label} className="rounded-lg bg-slate-50 p-3">
                <dt className="text-sm text-slate-600">{label}</dt><dd className="text-xl font-semibold">{count}</dd>
              </div>
            ))}
          </dl>
          <p className="text-sm text-slate-600">
            Successful rows reflect database inserts. Skipped and failed rows include local validation rejections.
          </p>
          {result.row_results.filter((row) => row.status !== 'successful').map((row) => (
            <p key={row.source_row} className="text-sm text-red-700">
              Row {row.source_row} ({row.status}): {row.errors.map((issue) => issue.message).join(' ')}
            </p>
          ))}
          <a href="/incharge/students" className="inline-block text-indigo-700 underline">View student directory</a>
        </section>
      ) : null}
      {!busy && !validation && !error ? (
        <EmptyState title="Choose a file to preview">Nothing is saved until you review and explicitly confirm the import.</EmptyState>
      ) : null}
    </ModulePage>
  );
}
