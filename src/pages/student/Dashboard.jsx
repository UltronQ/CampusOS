import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ModulePage from '../../components/layout/ModulePage';
import { StatCards, SectionCard } from '../../components/dashboard/StatCards';
import StatusBadge from '../../components/ui/StatusBadge';
import Button from '../../components/ui/Button';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States';
import { useStudentApplications } from '../../hooks/usePlacement';
import * as authService from '../../services/authService';
import {
  computeOverallStatus,
  pendingRequirements,
  getStudentOwnClearances,
} from '../../services/noDuesService';
import {
  APPLICATION_STATUS_LABELS,
  CLEARANCE_OVERALL_LABELS,
  formatCtc,
} from '../../app/placementLabels';

/**
 * Module 5/6 — Student dashboard.
 *
 * Everything here is scoped to the signed-in student by the database (RLS):
 * own applications, own published offers, own clearance decisions. Unpublished
 * stage results never reach this screen. Overall no-dues status is derived
 * from the student's own stored decisions against the full mandatory set —
 * Cleared appears only when every mandatory item is Cleared or Not Applicable
 * with in-charge approval evidence.
 */

function overallTone(overall) {
  if (overall === 'cleared') return 'success';
  if (overall === 'not_configured') return 'warning';
  return 'default';
}

export default function StudentDashboard() {
  const navigate = useNavigate();
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
  const applications = useStudentApplications(studentId);

  useEffect(() => {
    let cancelled = false;
    if (!studentId) return undefined;
    setClearance((prev) => ({ ...prev, loading: true }));
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

  const apps = applications.data ?? [];
  const offers = useMemo(
    () => apps.flatMap((app) => (app.offers ?? []).map((offer) => ({ ...offer, drive: app.drives }))),
    [apps],
  );
  const activeOffers = offers.filter((offer) => ['offered', 'accepted'].includes(offer.status));

  const overall = clearance.data
    ? computeOverallStatus(studentId, clearance.data.items ?? [], clearance.data.rows ?? [])
    : null;
  const requirements = clearance.data
    ? pendingRequirements(studentId, clearance.data.items ?? [], clearance.data.rows ?? [])
    : [];
  const decisions = clearance.data?.rows ?? [];
  const byItem = new Map(decisions.map((row) => [row.clearance_item_id, row]));
  const checklistItems = (clearance.data?.items ?? []).filter((item) => item.is_active && item.is_mandatory);

  if (record.loading) return <LoadingState label="Loading your record…" />;
  if (record.error) return <ErrorState title="Could not load your record" error={record.error} />;
  if (!record.data) {
    return (
      <ModulePage title="My Dashboard">
        <EmptyState title="No student record linked">
          Your account is not linked to a student record yet. The Placement In-Charge must
          link your university email before your dashboard can show anything.
        </EmptyState>
      </ModulePage>
    );
  }

  return (
    <ModulePage
      title="My Dashboard"
      description="Your placement progress, published offers and no-dues clearance. Every figure comes from your own authorized records — other students' data is never visible here."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCards label="Applications" value={apps.length} sub="recruitment drives you joined" />
        <StatCards label="Active offers" value={activeOffers.length} tone={activeOffers.length > 0 ? 'success' : 'default'} sub="offered or accepted" />
        <StatCards
          label="Overall no-dues"
          value={overall ? (CLEARANCE_OVERALL_LABELS[overall.overall] ?? overall.overall) : '—'}
          tone={overallTone(overall?.overall)}
          sub={overall ? `${overall.cleared + overall.notApplicable}/${overall.mandatoryTotal} mandatory cleared` : undefined}
        />
        <StatCards label="Batch" value={record.data.graduation_year ?? '—'} sub={`${record.data.departments?.code ?? 'Department not set'}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Placement progress">
          {applications.loading ? (
            <LoadingState label="Loading your applications…" />
          ) : applications.error ? (
            <ErrorState title="Applications unavailable" error={applications.error} />
          ) : apps.length === 0 ? (
            <EmptyState title="No applications yet">
              You will see your recruitment progress here once the Placement In-Charge
              registers you for a drive.
            </EmptyState>
          ) : (
            <ul className="space-y-3">
              {apps.map((app) => (
                <li key={app.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">{app.drives?.companies?.name} — {app.drives?.title}</p>
                    <StatusBadge status={app.status} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {APPLICATION_STATUS_LABELS[app.status] ?? app.status}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Published offers" actions={
          <Button variant="ghost" onClick={() => navigate('/student/offers')}>View all</Button>
        }>
          {activeOffers.length === 0 ? (
            <EmptyState title="No offers yet">
              Offers appear here once they are recorded against your application.
            </EmptyState>
          ) : (
            <ul className="space-y-3">
              {activeOffers.map((offer) => (
                <li key={offer.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">{offer.drive?.companies?.name} — {offer.drive?.title}</p>
                    <StatusBadge status={offer.status} />
                  </div>
                  <p className="mt-1 text-sm tabular-nums">{formatCtc(offer.annual_ctc_minor, offer.currency)}</p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard
        title="No-dues clearance"
        actions={
          <Button variant="secondary" onClick={() => window.print()}>Print statement</Button>
        }
      >
        {clearance.loading ? (
          <LoadingState label="Loading your clearance…" />
        ) : clearance.error ? (
          <ErrorState title="Clearance unavailable" error={clearance.error} />
        ) : checklistItems.length === 0 ? (
          <EmptyState title="No checklist configured">
            Your department has not published a mandatory no-dues checklist yet, so your
            status is Not Configured.
          </EmptyState>
        ) : (
          <>
            <ul className="space-y-2">
              {checklistItems.map((item) => {
                const decision = byItem.get(item.id);
                return (
                  <li key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
                    <span className="text-sm">{item.name}</span>
                    <StatusBadge status={decision ? decision.status : 'pending'} />
                  </li>
                );
              })}
            </ul>
            {requirements.length > 0 ? (
              <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                <p className="font-medium">Pending requirements</p>
                <ul className="mt-1 list-inside list-disc space-y-0.5">
                  {requirements.map((item) => (
                    <li key={item.id}>{item.name}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
                All mandatory no-dues items are satisfied. You are cleared.
              </div>
            )}
          </>
        )}
      </SectionCard>
    </ModulePage>
  );
}
