import { useState } from 'react';
import ModulePage from '../../components/layout/ModulePage';
import DataTable from '../../components/ui/DataTable';
import FormField from '../../components/ui/FormField';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States';
import StudentForm from '../../components/students/StudentForm';
import { useStudents, useDepartments } from '../../hooks/useStudents';
import * as studentsService from '../../services/studentsService';
import { IMPORT_CONFIG } from '../../app/config';

/**
 * Module 1 — Student & department management (Placement In-Charge).
 * All data comes from studentsService (Member 2 tables + RLS). Every write
 * result is real: conflicts and permission failures surface as errors;
 * nothing is overwritten silently and no success is shown optimistically.
 */

function DepartmentsPanel({ departments, onChanged }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleAdd(event) {
    event.preventDefault();
    setError(null);
    if (!code.trim() || !name.trim()) {
      setError(new Error('Both department code and name are required.'));
      return;
    }
    setBusy(true);
    try {
      await studentsService.createDepartment({ code, name });
      setCode('');
      setName('');
      onChanged();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Departments" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">Departments</h2>
      <p className="mt-1 text-xs text-slate-500">
        Department codes feed the student form, filters and CSV import validation.
      </p>
      {departments.loading ? (
        <div className="mt-4"><LoadingState label="Loading departments…" /></div>
      ) : departments.error ? (
        <div className="mt-4"><ErrorState title="Departments unavailable" error={departments.error} /></div>
      ) : (
        <ul className="mt-4 flex flex-wrap gap-2">
          {departments.data.map((dept) => (
            <li
              key={dept.id}
              className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700"
            >
              <span className="font-semibold">{dept.code}</span>
              <span className="mx-1 text-slate-400">·</span>
              {dept.name}
            </li>
          ))}
          {departments.data.length === 0 ? (
            <li className="text-sm text-slate-500">No departments yet — add the first one below.</li>
          ) : null}
        </ul>
      )}
      {error ? <div className="mt-4"><ErrorState title="Could not add department" error={error} /></div> : null}
      <form onSubmit={handleAdd} className="mt-4 flex flex-wrap items-end gap-3" noValidate>
        <FormField
          label="Code"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="CSE"
          className="w-28"
          disabled={busy}
        />
        <FormField
          label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Computer Science"
          className="w-56"
          disabled={busy}
        />
        <Button type="submit" busy={busy}>
          Add department
        </Button>
      </form>
    </section>
  );
}

export default function Students() {
  const [filters, setFilters] = useState({
    q: '',
    department_id: '',
    batch: '',
  });
  const [showDepartments, setShowDepartments] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const students = useStudents(filters);
  const departments = useDepartments();

  // Batch options come from the configured graduation-year range, not clock.
  const batches = Array.from(
    { length: IMPORT_CONFIG.max_graduation_year - IMPORT_CONFIG.min_graduation_year + 1 },
    (_, index) => IMPORT_CONFIG.min_graduation_year + index,
  );

  function setFilter(field) {
    return (event) => setFilters((prev) => ({ ...prev, [field]: event.target.value }));
  }

  function openAdd() {
    setEditing(null);
    setSaveError(null);
    setFormOpen(true);
  }

  function openEdit(student) {
    setEditing(student);
    setSaveError(null);
    setFormOpen(true);
  }

  async function handleSave(payload) {
    setSaving(true);
    setSaveError(null);
    try {
      if (editing) await studentsService.updateStudent(editing.id, payload);
      else await studentsService.createStudent(payload);
      setFormOpen(false);
      students.reload();
    } catch (err) {
      setSaveError(err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await studentsService.deleteStudent(deleteTarget.id);
      setDeleteTarget(null);
      students.reload();
    } catch (err) {
      setDeleteTarget(null);
      setSaveError(err);
    } finally {
      setDeleting(false);
    }
  }

  const columns = [
    {
      key: 'student_number',
      label: 'Roll number',
      render: (row) => <span className="font-mono text-xs">{row.student_number}</span>,
    },
    { key: 'full_name', label: 'Name' },
    {
      key: 'department',
      label: 'Department',
      render: (row) => row.department?.code ?? '—',
    },
    {
      key: 'program',
      label: 'Program / Year / Section',
      render: () => <span className="text-xs text-slate-400">Pending schema</span>,
    },
    {
      key: 'graduation_year',
      label: 'Batch',
      align: 'right',
    },
    {
      key: 'cgpa',
      label: 'CGPA',
      align: 'right',
      render: (row) => <span className="text-xs tabular-nums">{row.cgpa ?? '—'}</span>,
    },
    {
      key: 'backlogs',
      label: 'Backlogs',
      align: 'right',
      render: (row) => <span className="text-xs tabular-nums">{row.backlogs ?? '—'}</span>,
    },
    { key: 'email', label: 'University email' },
    {
      key: 'actions',
      label: 'Actions',
      render: (row) => (
        <span className="flex gap-2">
          <Button variant="ghost" onClick={() => openEdit(row)} aria-label={`Edit ${row.full_name}`}>
            Edit
          </Button>
          <Button
            variant="ghost"
            className="text-red-600 hover:bg-red-50"
            onClick={() => setDeleteTarget(row)}
            aria-label={`Delete ${row.full_name}`}
          >
            Delete
          </Button>
        </span>
      ),
    },
  ];

  return (
    <ModulePage
      title="Students"
      description="Student and department records for placement management. Writes go through RLS-protected services — conflicts fail loudly and nothing is overwritten silently."
    >
      <section aria-label="Filters" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <FormField
            label="Search"
            value={filters.q}
            onChange={setFilter('q')}
            placeholder="Roll, name or email"
          />
          <FormField
            label="Department"
            as="select"
            value={filters.department_id}
            onChange={setFilter('department_id')}
          >
            <option value="">All departments</option>
            {departments.data.map((dept) => (
              <option key={dept.id} value={dept.id}>
                {dept.code}
              </option>
            ))}
          </FormField>
          <FormField label="Batch" as="select" value={filters.batch} onChange={setFilter('batch')}>
            <option value="">All batches</option>
            {batches.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </FormField>
          <div className="flex items-end gap-2">
            <Button variant="secondary" onClick={() => setFilters({ q: '', department_id: '', batch: '' })}>
              Clear
            </Button>
            <Button onClick={openAdd}>Add student</Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>
            {students.loading
              ? 'Loading students…'
              : students.error
                ? 'Students unavailable'
                : `${students.data.length} student${students.data.length === 1 ? '' : 's'} shown`}
          </span>
          <span className="text-slate-400">
            Placement-registration and eligibility columns arrive with the Member 2 schema
            extension.
          </span>
          <button
            type="button"
            onClick={() => setShowDepartments((open) => !open)}
            aria-expanded={showDepartments}
            className="font-medium text-indigo-600 hover:text-indigo-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            {showDepartments ? 'Hide department management' : 'Manage departments'}
          </button>
        </div>
      </section>

      {showDepartments ? (
        <DepartmentsPanel departments={departments} onChanged={departments.reload} />
      ) : null}

      {saveError ? (
        <ErrorState title="Last write failed" error={saveError} actions={
          <Button variant="secondary" onClick={() => setSaveError(null)}>Dismiss</Button>
        } />
      ) : null}

      {students.loading ? (
        <LoadingState label="Loading students…" />
      ) : students.error ? (
        <ErrorState title="Students unavailable" error={students.error} />
      ) : students.data.length === 0 ? (
        <EmptyState
          title={filters.q || filters.department_id || filters.batch
            ? 'No students match these filters'
            : 'No students yet'}
          actions={<Button onClick={openAdd}>Add the first student</Button>}
        >
          {filters.q || filters.department_id || filters.batch
            ? 'Adjust or clear the filters, import a batch from the Import Students page, or add a student manually.'
            : 'Add students one at a time or import a validated CSV/XLSX batch.'}
        </EmptyState>
      ) : (
        <DataTable
          columns={columns}
          rows={students.data}
          caption="Student directory"
          rowKey={(row) => row.id}
        />
      )}

      <Modal
        open={formOpen}
        onClose={() => (saving ? undefined : setFormOpen(false))}
        title={editing ? `Edit ${editing.student_number}` : 'Add student'}
      >
        {saveError && formOpen ? <ErrorState title="Save failed" error={saveError} /> : null}
        <StudentForm
          student={editing}
          departments={departments.data}
          config={IMPORT_CONFIG}
          busy={saving}
          onSubmit={handleSave}
          onCancel={() => setFormOpen(false)}
        />
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        busy={deleting}
        danger
        title="Delete student"
        message={`Permanently delete ${deleteTarget?.full_name ?? ''} (${deleteTarget?.student_number ?? ''})? Students with linked placement records cannot be deleted — the database will reject it rather than orphan their history.`}
        confirmLabel="Delete student"
      />
    </ModulePage>
  );
}
