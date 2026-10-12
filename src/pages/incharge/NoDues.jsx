import { useCallback, useEffect, useMemo, useState } from 'react';
import ModulePage from '../../components/layout/ModulePage';
import { StatCards, SectionCard } from '../../components/dashboard/StatCards';
import DataTable from '../../components/ui/DataTable';
import StatusBadge from '../../components/ui/StatusBadge';
import FormField from '../../components/ui/FormField';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States';
import { useDepartments } from '../../hooks/useStudents';
import {
  fetchClearanceWorkspace,
  computeOverallStatus,
  saveClearanceRemark,
} from '../../services/noDuesService';
import * as clearanceService from '../../services/clearanceService';
import * as authService from '../../services/authService';
import { CLEARANCE_OVERALL_LABELS } from '../../app/placementLabels';

/**
 * Module 5 — No-dues management (Placement In-Charge).
 *
 * Configure per-department checklist items, edit per-student item statuses and
 * remarks, see pending requirements and department progress, and open a
 * printable statement. Approval uses Member 2's clearanceService so the
 * approved_by/approved_at evidence rules stay in one place — the in-charge's
 * profile id is the approver, never the student. Students have no UPDATE
 * policy, so self-approval is blocked at the database, not just here.
 */

function overallTone(overall) {
  if (overall === 'cleared') return 'success';
  if (overall === 'not_configured') return 'warning';
  return 'default';
}

function StatementModal({ student, items, clearances, onClose }) {
  const overall = computeOverallStatus(student.id, items, clearances);
  const rows = items.filter((item) => item.is_active && item.is_mandatory);
  const studentRows = clearances.filter((row) => row.student_id === student.id);
  const byItem = new Map(studentRows.map((row) => [row.clearance_item_id, row]));

  return (
    <Modal open onClose={onClose} title={`No-dues statement — ${student.full_name}`}>
      <div className="print:block">
        <div className="mb-4 border-b border-slate-200 pb-3 text-sm">
          <p><span className="font-medium">Student:</span> {student.full_name} ({student.student_number})</p>
          <p><span className="font-medium">Department:</span> {student.departments?.code ?? '—'} · Batch {student.graduation_year}</p>
          <p className="mt-1"><span className="font-medium">Overall status:</span> {CLEARANCE_OVERALL_LABELS[overall.overall] ?? overall.overall}</p>
        </div>
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-3">Requirement</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2">Remark</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => {
              const decision = byItem.get(item.id);
              return (
                <tr key={item.id} className="border-b border-slate-100">
                  <td className="py-2 pr-3">{item.name}</td>
                  <td className="py-2 pr-3">
                    <StatusBadge status={decision ? decision.status : 'pending'} />
                  </td>
                  <td className="py-2 text-xs text-slate-500">{decision?.remarks || '—'}</td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-3 text-slate-500">No mandatory checklist configured for this department.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <p className="mt-4 text-[11px] text-slate-400">
          Generated {new Date().toLocaleString('en-IN')} · A student is cleared only when every mandatory item is Cleared or Not Applicable with in-charge approval.
        </p>
      </div>
      <div className="mt-5 flex justify-end gap-3 print:hidden">
        <Button variant="secondary" onClick={onClose}>Close</Button>
        <Button onClick={() => window.print()}>Print statement</Button>
      </div>
    </Modal>
  );
}

export default function NoDues() {
  const departments = useDepartments();
  const [workspace, setWorkspace] = useState({ loading: true, data: null, error: null });
  const [departmentId, setDepartmentId] = useState('');
  const [actionError, setActionError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [statement, setStatement] = useState(null);
  const [remarkTarget, setRemarkTarget] = useState(null);
  const [remarkText, setRemarkText] = useState('');
  const [itemDraft, setItemDraft] = useState({ department_id: '', name: '', is_mandatory: true, is_active: true });

  const load = useCallback(() => {
    setWorkspace((prev) => ({ ...prev, loading: true, error: null }));
    fetchClearanceWorkspace()
      .then((data) => setWorkspace({ loading: false, data, error: null }))
      .catch((error) => setWorkspace({ loading: false, data: null, error }));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const data = workspace.data;
  const items = data?.items ?? [];
  const clearances = data?.studentClearances ?? [];
  const students = data?.students ?? [];

  const departmentItems = useMemo(
    () => (departmentId ? items.filter((item) => item.department_id === departmentId) : items),
    [items, departmentId],
  );

  const departmentStudents = useMemo(
    () => (departmentId ? students.filter((s) => s.department_id === departmentId) : students),
    [students, departmentId],
  );

  /** Per-student rollup with the pending requirements the in-charge must chase. */
  const studentRows = useMemo(() => {
    return departmentStudents.map((student) => {
      const overall = computeOverallStatus(student.id, items, clearances);
      const studentDecisions = clearances.filter((row) => row.student_id === student.id);
      const decidedIds = new Set(studentDecisions.map((row) => row.clearance_item_id));
      const mandatory = items.filter((item) => item.is_active && item.is_mandatory && item.department_id === student.department_id);
      const missing = mandatory.filter((item) => !decidedIds.has(item.id));
      const pending = studentDecisions.filter((row) => row.status === 'pending');
      return { student, overall, missing, pending };
    });
  }, [departmentStudents, items, clearances]);

  const summary = useMemo(() => {
    let cleared = 0;
    let pending = 0;
    let notConfigured = 0;
    for (const row of studentRows) {
      if (row.overall.overall === 'cleared') cleared += 1;
      else if (row.overall.overall === 'not_configured') notConfigured += 1;
      else pending += 1;
    }
    return { total: studentRows.length, cleared, pending, notConfigured };
  }, [studentRows]);

  async function handleApprove(decision, status) {
    setBusy(true);
    setActionError(null);
    try {
      const profile = await authService.getCurrentProfile();
      if (!profile || profile.role !== 'placement_incharge') {
        throw new Error('Only the Placement In-Charge can approve clearances.');
      }
      await clearanceService.approveClearance(decision.id, profile.id, status);
      load();
    } catch (err) {
      setActionError(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleRevert(decision) {
    setBusy(true);
    setActionError(null);
    try {
      await clearanceService.markClearancePending(decision.id);
      load();
    } catch (err) {
      setActionError(err);
    } finally {
      setBusy(false);
    }
  }

  function openRemark(student, item) {
    const existing = clearances.find(
      (row) => row.student_id === student.id && row.clearance_item_id === item.id,
    );
    setRemarkTarget({ student, item, decisionId: existing?.id ?? null });
    setRemarkText(existing?.remarks ?? '');
  }

  async function handleSaveRemark() {
    setBusy(true);
    setActionError(null);
    try {
      await saveClearanceRemark(remarkTarget.student.id, remarkTarget.item.id, remarkText.trim());
      setRemarkTarget(null);
      load();
    } catch (err) {
      setActionError(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateItem(event) {
    event.preventDefault();
    if (!itemDraft.department_id || !itemDraft.name.trim()) {
      setActionError(new Error('Choose a department and enter a checklist item name.'));
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      await clearanceService.createClearanceItem({
        department_id: itemDraft.department_id,
        name: itemDraft.name.trim(),
        is_mandatory: itemDraft.is_mandatory,
        is_active: itemDraft.is_active,
      });
      setItemDraft({ ...itemDraft, name: '' });
      load();
    } catch (err) {
      setActionError(err);
    } finally {
      setBusy(false);
    }
  }

  const columns = [
    { key: 'student', label: 'Student', render: (row) => (
      <div>
        <p className="font-medium">{row.student.full_name}</p>
        <p className="font-mono text-xs text-slate-500">{row.student.student_number}</p>
      </div>
    ) },
    { key: 'overall', label: 'Overall', render: (row) => (
      <StatusBadge status={row.overall.overall} tone={overallTone(row.overall.overall)} />
    ) },
    { key: 'progress', label: 'Mandatory progress', render: (row) => (
      <span className="text-xs tabular-nums">
        {row.overall.cleared + row.overall.notApplicable}/{row.overall.mandatoryTotal} satisfied
      </span>
    ) },
    { key: 'missing', label: 'Pending requirements', render: (row) => (
      row.missing.length === 0 ? (
        <span className="text-xs text-slate-400">None missing</span>
      ) : (
        <span className="text-xs text-slate-600">{row.missing.map((item) => item.name).join(', ')}</span>
      )
    ) },
    { key: 'actions', label: 'Actions', render: (row) => (
      <Button variant="ghost" onClick={() => setStatement(row.student)}>View statement</Button>
    ) },
  ];

  return (
    <ModulePage
      title="No-Dues Checklists"
      description="Configure departmental checklist categories, record item decisions and remarks, and track department/batch progress. Students can never approve their own clearances — approval is the in-charge's action and is enforced by the database."
    >
      {actionError ? (
        <ErrorState title="Last action failed" error={actionError} actions={
          <Button variant="secondary" onClick={() => setActionError(null)}>Dismiss</Button>
        } />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCards label="Students in scope" value={summary.total} sub={departmentId ? 'selected department' : 'all departments'} />
        <StatCards label="Fully cleared" value={summary.cleared} tone="success" />
        <StatCards label="Pending" value={summary.pending} tone={summary.pending > 0 ? 'warning' : 'default'} />
        <StatCards label="Not configured" value={summary.notConfigured} sub="no mandatory checklist" />
      </div>

      <SectionCard title="Configure checklist categories">
        <form onSubmit={handleCreateItem} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" noValidate>
          <FormField
            label="Department"
            as="select"
            value={itemDraft.department_id}
            onChange={(event) => setItemDraft({ ...itemDraft, department_id: event.target.value })}
            disabled={busy}
          >
            <option value="">Select department…</option>
            {(departments.data ?? []).map((dept) => (
              <option key={dept.id} value={dept.id}>{dept.code} — {dept.name}</option>
            ))}
          </FormField>
          <FormField
            label="Item name"
            value={itemDraft.name}
            onChange={(event) => setItemDraft({ ...itemDraft, name: event.target.value })}
            placeholder="Library dues, Lab equipment, Hostel…"
            disabled={busy}
          />
          <FormField label="Requirement" as="select" value={itemDraft.is_mandatory ? 'mandatory' : 'optional'} onChange={(event) => setItemDraft({ ...itemDraft, is_mandatory: event.target.value === 'mandatory' })} disabled={busy}>
            <option value="mandatory">Mandatory</option>
            <option value="optional">Optional</option>
          </FormField>
          <FormField label="State" as="select" value={itemDraft.is_active ? 'active' : 'inactive'} onChange={(event) => setItemDraft({ ...itemDraft, is_active: event.target.value === 'active' })} disabled={busy}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </FormField>
          <div className="sm:col-span-2 lg:col-span-4">
            <Button type="submit" busy={busy}>Add checklist item</Button>
          </div>
        </form>

        <div className="mt-5">
          <h3 className="text-sm font-semibold text-slate-700">Current items</h3>
          {workspace.loading ? (
            <div className="mt-3"><LoadingState label="Loading checklist…" /></div>
          ) : workspace.error ? (
            <div className="mt-3"><ErrorState title="Checklist unavailable" error={workspace.error} /></div>
          ) : items.length === 0 ? (
            <div className="mt-3"><EmptyState title="No checklist items yet">Add the first mandatory item above.</EmptyState></div>
          ) : (
            <ul className="mt-3 flex flex-wrap gap-2">
              {items.map((item) => (
                <li key={item.id} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm">
                  <span className="font-medium">{item.name}</span>
                  <span className="text-xs text-slate-400">{item.departments?.code}</span>
                  <StatusBadge status={item.is_mandatory ? 'mandatory' : 'optional'} />
                  {!item.is_active ? <StatusBadge status="inactive" /> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </SectionCard>

      <section aria-label="Department progress filters" className="flex flex-wrap items-end gap-3">
        <FormField
          label="Filter by department"
          as="select"
          value={departmentId}
          onChange={(event) => setDepartmentId(event.target.value)}
          className="w-64"
        >
          <option value="">All departments</option>
          {(departments.data ?? []).map((dept) => (
            <option key={dept.id} value={dept.id}>{dept.code} — {dept.name}</option>
          ))}
        </FormField>
        <FormField
          label="Batch progress"
          hint="Batch-level rollup is on the dashboard; use the statement for a single student"
          className="w-64"
        >
          <div className="text-sm text-slate-600">
            {(() => {
              const byBatch = new Map();
              for (const row of studentRows) {
                const batch = row.student.graduation_year;
                if (!byBatch.has(batch)) byBatch.set(batch, { total: 0, cleared: 0 });
                const entry = byBatch.get(batch);
                entry.total += 1;
                if (row.overall.overall === 'cleared') entry.cleared += 1;
              }
              if (byBatch.size === 0) return 'No students in scope.';
              return [...byBatch.entries()]
                .sort((a, b) => a[0] - b[0])
                .map(([batch, entry]) => `${batch}: ${entry.cleared}/${entry.cleared + entry.total}`)
                .join(' · ');
            })()}
          </div>
        </FormField>
      </section>

      <SectionCard title="Student clearance status" source={null}>
        {workspace.loading ? (
          <LoadingState label="Loading students…" />
        ) : workspace.error ? (
          <ErrorState title="Students unavailable" error={workspace.error} />
        ) : studentRows.length === 0 ? (
          <EmptyState title="No students in scope">Add students or choose a different department.</EmptyState>
        ) : (
          <DataTable columns={columns} rows={studentRows} rowKey={(row) => row.student.id} caption="Student clearance status" />
        )}
      </SectionCard>

      {statement ? (
        <StatementModal
          student={statement}
          items={items.filter((item) => item.department_id === statement.department_id)}
          clearances={clearances}
          onClose={() => setStatement(null)}
        />
      ) : null}

      {remarkTarget ? (
        <Modal
          open
          onClose={busy ? () => {} : () => setRemarkTarget(null)}
          title={`Remark — ${remarkTarget.item.name}`}
        >
          <p className="text-sm text-slate-500">{remarkTarget.student.full_name}</p>
          <div className="mt-3">
            <FormField
              label="Remark"
              as="textarea"
              value={remarkText}
              onChange={(event) => setRemarkText(event.target.value)}
              placeholder="Bring the signed clearance slip to the department office…"
              disabled={busy}
            />
          </div>
          <div className="mt-5 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setRemarkTarget(null)} disabled={busy}>Cancel</Button>
            <Button onClick={handleSaveRemark} busy={busy}>Save remark</Button>
          </div>
        </Modal>
      ) : null}
    </ModulePage>
  );
}
