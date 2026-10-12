import { useMemo, useState } from 'react';
import ModulePage from '../../components/layout/ModulePage';
import DataTable from '../../components/ui/DataTable';
import FormField from '../../components/ui/FormField';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States';
import { useDrives, useCompanies } from '../../hooks/usePlacement';
import { useDepartments } from '../../hooks/useStudents';
import * as recruitmentService from '../../services/recruitmentService';
import * as driveService from '../../services/driveService';
import { IMPORT_CONFIG } from '../../app/config';
import {
  DRIVE_STATUS_LABELS,
  DRIVE_STATUS_VALUES,
  DEFAULT_STAGE_PRESET,
} from '../../app/placementLabels';

/**
 * Module 2 — Recruitment drives (Placement In-Charge).
 * Create/edit with PDF lifecycle statuses, job metadata, eligibility
 * targeting and an ordered stage pipeline. All persistence goes through
 * Member 2's recruitmentService plus the documented Member 1 extension
 * (driveService) for fields that service does not expose yet.
 */

const BATCHES = Array.from(
  { length: IMPORT_CONFIG.max_graduation_year - IMPORT_CONFIG.min_graduation_year + 1 },
  (_, index) => IMPORT_CONFIG.min_graduation_year + index,
);

const EMPTY_FORM = {
  company_id: '',
  title: '',
  start_date: '',
  application_deadline: '',
  min_cgpa: '',
  max_backlogs: '',
  status: 'draft',
  department_ids: [],
  batch_years: [],
  stage_names: [],
};

function toFormValues(drive) {
  if (!drive) return { ...EMPTY_FORM, stage_names: [...DEFAULT_STAGE_PRESET] };
  return {
    company_id: drive.company_id ?? '',
    title: drive.title ?? '',
    start_date: drive.start_date ?? '',
    application_deadline: drive.application_deadline
      ? String(drive.application_deadline).slice(0, 10)
      : '',
    min_cgpa: drive.min_cgpa ?? '',
    max_backlogs: drive.max_backlogs ?? '',
    status: drive.status ?? 'draft',
    department_ids: (drive.drive_departments ?? []).map((row) => row.department_id),
    batch_years: drive.eligible_graduation_years ?? [],
    stage_names: (drive.recruitment_stages ?? []).map((stage) => stage.name),
  };
}

function DriveForm({ drive, companies, departments, busy, onSubmit, onCancel }) {
  const [values, setValues] = useState(() => toFormValues(drive));
  const [newStage, setNewStage] = useState('');
  const [error, setError] = useState(null);

  function set(field, value) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  function toggleInList(field, value) {
    setValues((prev) => ({
      ...prev,
      [field]: prev[field].includes(value)
        ? prev[field].filter((item) => item !== value)
        : [...prev[field], value],
    }));
  }

  function addStage(name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (values.stage_names.includes(trimmed)) {
      setError(new Error(`Stage "${trimmed}" is already in the pipeline.`));
      return;
    }
    setError(null);
    set('stage_names', [...values.stage_names, trimmed]);
    setNewStage('');
  }

  function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    if (!values.company_id || !values.title.trim() || !values.start_date) {
      setError(new Error('Company, drive title and start date are required.'));
      return;
    }
    const minCgpa = values.min_cgpa === '' ? null : Number(values.min_cgpa);
    if (minCgpa !== null && (!Number.isFinite(minCgpa) || minCgpa < 0 || minCgpa > 10)) {
      setError(new Error('Minimum CGPA must be between 0 and 10, or blank.'));
      return;
    }
    const maxBacklogs = values.max_backlogs === '' ? null : Number(values.max_backlogs);
    if (maxBacklogs !== null && (!Number.isInteger(maxBacklogs) || maxBacklogs < 0)) {
      setError(new Error('Maximum backlogs must be a non-negative whole number, or blank.'));
      return;
    }
    onSubmit({
      payload: {
        company_id: values.company_id,
        title: values.title.trim(),
        start_date: values.start_date,
        application_deadline: values.application_deadline
          ? new Date(values.application_deadline).toISOString()
          : null,
        min_cgpa: minCgpa,
        max_backlogs: maxBacklogs,
        status: values.status,
      },
      stageNames: values.stage_names,
      eligibility: { departmentIds: values.department_ids, graduationYears: values.batch_years },
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {error ? <ErrorState title="Check the drive details" error={error} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Company"
          as="select"
          value={values.company_id}
          onChange={(event) => set('company_id', event.target.value)}
          disabled={busy}
          required
        >
          <option value="">Select company…</option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </FormField>
        <FormField
          label="Drive title"
          value={values.title}
          onChange={(event) => set('title', event.target.value)}
          placeholder="Graduate Engineer Trainee"
          disabled={busy}
          required
        />
        <FormField
          label="Drive start date"
          type="date"
          value={values.start_date}
          onChange={(event) => set('start_date', event.target.value)}
          disabled={busy}
          required
        />
        <FormField
          label="Application deadline"
          type="date"
          value={values.application_deadline}
          onChange={(event) => set('application_deadline', event.target.value)}
          disabled={busy}
        />
        <FormField
          label="Minimum CGPA"
          inputMode="decimal"
          value={values.min_cgpa}
          onChange={(event) => set('min_cgpa', event.target.value)}
          placeholder="e.g. 7.0"
          hint="Blank = no minimum"
          disabled={busy}
        />
        <FormField
          label="Maximum backlogs"
          inputMode="numeric"
          value={values.max_backlogs}
          onChange={(event) => set('max_backlogs', event.target.value)}
          placeholder="e.g. 0"
          hint="Blank = no limit"
          disabled={busy}
        />
        <FormField
          label="Drive status"
          as="select"
          value={values.status}
          onChange={(event) => set('status', event.target.value)}
          disabled={busy}
        >
          {DRIVE_STATUS_VALUES.map((status) => (
            <option key={status} value={status}>
              {DRIVE_STATUS_LABELS[status]}
            </option>
          ))}
        </FormField>
        <FormField
          label="Eligible batches"
          hint="No selection = all batches"
          className="sm:col-span-2"
        >
          <div className="flex flex-wrap gap-2 pt-1">
            {BATCHES.map((year) => (
              <label
                key={year}
                className={`inline-flex cursor-pointer items-center gap-1 rounded-lg border px-3 py-1 text-sm ${
                  values.batch_years.includes(year)
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-slate-300 text-slate-600'
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={values.batch_years.includes(year)}
                  onChange={() => toggleInList('batch_years', year)}
                  disabled={busy}
                />
                {year}
              </label>
            ))}
          </div>
        </FormField>
        <FormField
          label="Eligible departments"
          hint="No selection = open to all departments"
          className="sm:col-span-2"
        >
          <div className="flex flex-wrap gap-2 pt-1">
            {departments.map((dept) => (
              <label
                key={dept.id}
                className={`inline-flex cursor-pointer items-center gap-1 rounded-lg border px-3 py-1 text-sm ${
                  values.department_ids.includes(dept.id)
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-slate-300 text-slate-600'
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={values.department_ids.includes(dept.id)}
                  onChange={() => toggleInList('department_ids', dept.id)}
                  disabled={busy}
                />
                {dept.code}
              </label>
            ))}
            {departments.length === 0 ? (
              <span className="text-sm text-slate-400">No departments configured yet.</span>
            ) : null}
          </div>
        </FormField>
      </div>

      <fieldset className="rounded-lg border border-slate-200 p-4">
        <legend className="px-2 text-sm font-semibold text-slate-700">Recruitment stage pipeline</legend>
        <p className="text-xs text-slate-500">
          Pre-offer stages the applicant moves through. &ldquo;Selected&rdquo;, &ldquo;Offer Received&rdquo;,
          &ldquo;Joined&rdquo;, &ldquo;Rejected&rdquo; and &ldquo;Withdrawn&rdquo; are recorded as application
          outcomes and offers, not stages.
        </p>
        <ol className="mt-3 space-y-2">
          {values.stage_names.map((stageName, index) => (
            <li key={stageName} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
              <span className="text-sm text-slate-700">
                <span className="mr-2 font-mono text-xs text-slate-400">{index + 1}</span>
                {stageName}
              </span>
              <Button
                variant="ghost"
                className="text-red-600"
                onClick={() => set('stage_names', values.stage_names.filter((name) => name !== stageName))}
                disabled={busy}
                aria-label={`Remove stage ${stageName}`}
              >
                Remove
              </Button>
            </li>
          ))}
          {values.stage_names.length === 0 ? (
            <li className="text-sm text-slate-400">No stages yet.</li>
          ) : null}
        </ol>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <FormField
            label="Add stage"
            value={newStage}
            onChange={(event) => setNewStage(event.target.value)}
            placeholder="e.g. Group Discussion"
            className="w-56"
            disabled={busy}
          />
          <Button variant="secondary" onClick={() => addStage(newStage)} disabled={busy}>
            Add stage
          </Button>
          {values.stage_names.length === 0 ? (
            <Button
              variant="ghost"
              onClick={() => set('stage_names', [...DEFAULT_STAGE_PRESET])}
              disabled={busy}
            >
              Use PDF default pipeline
            </Button>
          ) : null}
        </div>
      </fieldset>

      <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" busy={busy}>
          {drive ? 'Save drive' : 'Create drive'}
        </Button>
      </div>
    </form>
  );
}

export default function Drives() {
  const drives = useDrives();
  const companies = useCompanies();
  const departments = useDepartments();
  const [statusFilter, setStatusFilter] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const filtered = useMemo(() => {
    if (!drives.data) return [];
    if (!statusFilter) return drives.data;
    return drives.data.filter((drive) => drive.status === statusFilter);
  }, [drives.data, statusFilter]);

  function openAdd() {
    setEditing(null);
    setSaveError(null);
    setFormOpen(true);
  }

  function openEdit(drive) {
    setEditing(drive);
    setSaveError(null);
    setFormOpen(true);
  }

  async function handleSubmit({ payload, stageNames, eligibility }) {
    setSaving(true);
    setSaveError(null);
    try {
      let driveId;
      if (editing) {
        const updated = await driveService.updateDrive(editing.id, payload);
        driveId = updated.id;
      } else {
        const created = await recruitmentService.createDrive(payload);
        driveId = created.id;
      }
      await driveService.syncDriveStages(driveId, stageNames, editing?.recruitment_stages ?? []);
      await driveService.saveDriveEligibility(driveId, eligibility);
      setFormOpen(false);
      drives.reload();
    } catch (err) {
      setSaveError(
        new Error(
          `${err?.message ?? 'Could not save the drive.'} ` +
            '(Eligibility columns come from the phase-one migration — confirm it is applied.)',
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(drive, status) {
    setSaveError(null);
    try {
      await recruitmentService.updateDriveStatus(drive.id, status);
      drives.reload();
    } catch (err) {
      setSaveError(new Error(err?.message ?? 'Could not change the drive status.'));
    }
  }

  const columns = [
    {
      key: 'company',
      label: 'Company',
      render: (row) => row.companies?.name ?? '—',
    },
    { key: 'title', label: 'Drive' },
    {
      key: 'start_date',
      label: 'Starts',
      render: (row) => <span className="text-xs">{row.start_date}</span>,
    },
    {
      key: 'application_deadline',
      label: 'Deadline',
      render: (row) => <span className="text-xs">{row.application_deadline ?? '—'}</span>,
    },
    {
      key: 'eligibility',
      label: 'Eligibility',
      render: (row) => {
        const depts = (row.drive_departments ?? []).map((d) => d.departments?.code).filter(Boolean);
        const years = row.eligible_graduation_years ?? [];
        const parts = [];
        parts.push(depts.length ? depts.join('/') : 'All depts');
        parts.push(years.length ? years.join(', ') : 'All years');
        return <span className="text-xs">{parts.join(' · ')}</span>;
      },
    },
    {
      key: 'recruitment_stages',
      label: 'Stages',
      align: 'right',
      render: (row) => <span className="text-xs">{(row.recruitment_stages ?? []).length}</span>,
    },
    {
      key: 'applicant_count',
      label: 'Applicants',
      align: 'right',
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <select
          aria-label={`Status for ${row.title}`}
          value={row.status}
          onChange={(event) => handleStatusChange(row, event.target.value)}
          className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
        >
          {DRIVE_STATUS_VALUES.map((status) => (
            <option key={status} value={status}>
              {DRIVE_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (row) => (
        <Button variant="ghost" onClick={() => openEdit(row)} aria-label={`Edit ${row.title}`}>
          Edit
        </Button>
      ),
    },
  ];

  return (
    <ModulePage
      title="Recruitment Drives"
      description="Drives with the PDF lifecycle (Planned → Open → In Progress → Completed / Cancelled), eligibility targeting, job metadata and stage pipelines. Cancelled drives are excluded from placement statistics."
    >
      {saveError ? <ErrorState title="Last drive operation failed" error={saveError} /> : null}

      <section aria-label="Drive controls" className="flex flex-wrap items-end justify-between gap-3">
        <FormField
          label="Filter by status"
          as="select"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="w-48"
        >
          <option value="">All statuses</option>
          {DRIVE_STATUS_VALUES.map((status) => (
            <option key={status} value={status}>
              {DRIVE_STATUS_LABELS[status]}
            </option>
          ))}
        </FormField>
        <Button onClick={openAdd}>Create drive</Button>
      </section>

      {drives.loading ? (
        <LoadingState label="Loading drives…" />
      ) : drives.error ? (
        <ErrorState title="Drives unavailable" error={drives.error} />
      ) : filtered.length === 0 ? (
        <EmptyState title={statusFilter ? 'No drives with this status' : 'No drives yet'}>
          {statusFilter
            ? 'Change the status filter or create a new drive.'
            : 'Create the first recruitment drive to start tracking applications.'}
        </EmptyState>
      ) : (
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(row) => row.id}
          caption="Recruitment drives"
        />
      )}

      <Modal
        open={formOpen}
        onClose={() => (saving ? undefined : setFormOpen(false))}
        title={editing ? `Edit drive: ${editing.title}` : 'Create drive'}
      >
        {companies.loading || departments.loading ? (
          <LoadingState label="Loading form data…" />
        ) : companies.error || departments.error ? (
          <ErrorState title="Form data unavailable" error={companies.error ?? departments.error} />
        ) : (
          <DriveForm
            drive={editing}
            companies={companies.data}
            departments={departments.data}
            busy={saving}
            onSubmit={handleSubmit}
            onCancel={() => setFormOpen(false)}
          />
        )}
      </Modal>
    </ModulePage>
  );
}
