import { useEffect, useState } from 'react';
import ModulePage from '../../components/layout/ModulePage';
import { SectionCard, StatCards } from '../../components/dashboard/StatCards';
import StatusBadge from '../../components/ui/StatusBadge';
import Button from '../../components/ui/Button';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States';
import * as authService from '../../services/authService';
import {
  computeOverallStatus,
  pendingRequirements,
  getStudentOwnClearances,
} from '../../services/noDuesService';
import { CLEARANCE_OVERALL_LABELS } from '../../app/placementLabels';

/**
 * Module 5 — Student clearance checklist (read-only).
 * Decisions are made by the Placement In-Charge; students have no UPDATE
 * policy on student_clearances (RLS), so self-approval is impossible even via
 * direct API calls. Overall status uses the full mandatory set.
 */
export default function StudentClearance() {
  const [record, setRecord] = useState({ loading: true, data: null, error: null });
  const [clearance, setClearance] = useState({ loading: true, data: null, error: null });

  useEffect(() => {
    let cancelled = false;
    authService
      .getStudentRecord()
      .then((data) => setRecord({ loading: false, data, error: null }))
      .catch((error) => setRecord({ loading: false, data: null, error }));
    return () => {
      cancelled = true;
    };
  }, []);

  const studentId = record.data?.id ?? null;

  useEffect(() => {
    let cancelled = false;
    if (!studentId) return undefined;
    getStudentOwnClearances(studentId)
      .then((data) => {
        if (!cancelled) setClearance({ loading: false, data, error: null });
      })
      .catch((error) => {
        if (!cancelled) setClearance({ loading: false, data: null, error });
      });
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  if (record.loading || (studentId && clearance.loading)) {
    return <LoadingState label="Loading your clearance…" />;
  }
  if (record.error) return <ErrorState title="Could not load your record" error={record.error} />;
  if (!record.data) {
    return (
      <ModulePage title="My Clearance">
        <EmptyState title="No student record linked">
          Your account is not linked to a student record yet, so no clearance checklist
          can be shown.
        </EmptyState>
      </ModulePage>
    );
  }
  if (clearance.error) {
    return <ErrorState title="Clearance unavailable" error={clearance.error} />;
  }

  const { rows, items } = clearance.data ?? { rows: [], items: [] };
  const mandatory = items.filter((item) => item.is_active && item.is_mandatory);
  const optional = items.filter((item) => item.is_active && !item.is_mandatory);
  const byItem = new Map(rows.map((row) => [row.clearance_item_id, row]));
  const overall = computeOverallStatus(studentId, items, rows);
  const requirements = pendingRequirements(studentId, items, rows);

  return (
    <ModulePage
      title="My Clearance"
      description="Your department's no-dues checklist and per-item status. This view is read-only — clearance decisions are made by the Placement In-Charge, never by students."
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCards
          label="Overall status"
          value={CLEARANCE_OVERALL_LABELS[overall.overall] ?? overall.overall}
          tone={overall.overall === 'cleared' ? 'success' : overall.overall === 'not_configured' ? 'warning' : 'default'}
        />
        <StatCards label="Mandatory satisfied" value={`${overall.cleared + overall.notApplicable}/${overall.mandatoryTotal}`} />
        <StatCards label="Pending / missing" value={overall.pending + overall.missing} tone={overall.pending + overall.missing > 0 ? 'warning' : 'default'} />
      </div>

      <SectionCard
        title="Mandatory checklist"
        actions={<Button variant="secondary" onClick={() => window.print()}>Print statement</Button>}
      >
        {mandatory.length === 0 ? (
          <EmptyState title="No checklist configured">
            Your department has not published a mandatory no-dues checklist yet.
          </EmptyState>
        ) : (
          <ul className="space-y-2 print:block">
            {mandatory.map((item) => {
              const decision = byItem.get(item.id);
              return (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3">
                  <div>
                    <p className="text-sm font-medium">{item.name}</p>
                    {decision?.remarks ? (
                      <p className="mt-0.5 text-xs text-slate-500">{decision.remarks}</p>
                    ) : null}
                  </div>
                  <StatusBadge status={decision ? decision.status : 'pending'} />
                </li>
              );
            })}
          </ul>
        )}
        {requirements.length > 0 ? (
          <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 print:bg-transparent">
            <p className="font-medium">Still required from you:</p>
            <ul className="mt-1 list-inside list-disc">
              {requirements.map((item) => (
                <li key={item.id}>{item.name}</li>
              ))}
            </ul>
          </div>
        ) : mandatory.length > 0 ? (
          <div className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 print:bg-transparent">
            All mandatory items are satisfied with in-charge approval. You are fully cleared.
          </div>
        ) : null}
      </SectionCard>

      {optional.length > 0 ? (
        <SectionCard title="Optional items (do not block clearance)">
          <ul className="space-y-2">
            {optional.map((item) => {
              const decision = byItem.get(item.id);
              return (
                <li key={item.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 p-3">
                  <span className="text-sm text-slate-600">{item.name}</span>
                  <StatusBadge status={decision ? decision.status : 'pending'} />
                </li>
              );
            })}
          </ul>
        </SectionCard>
      ) : null}
    </ModulePage>
  );
}
