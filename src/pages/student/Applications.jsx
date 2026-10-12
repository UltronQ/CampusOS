import { useEffect, useState } from 'react';
import ModulePage from '../../components/layout/ModulePage';
import StatusBadge from '../../components/ui/StatusBadge';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States';
import { useStudentApplications } from '../../hooks/usePlacement';
import * as authService from '../../services/authService';
import { APPLICATION_STATUS_LABELS } from '../../app/placementLabels';

/**
 * Module 3 — Student application history (own records only).
 * RLS scopes every query to the signed-in student; unpublished stage results
 * never reach this screen because the database filters them, not the UI.
 */

function EligibilityCard({ student }) {
  const hasRegistration = 'placement_registered' in student;
  const hasEligibility = 'eligibility_status' in student;
  return (
    <section aria-label="Eligibility status" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">Eligibility</h2>
      {hasRegistration || hasEligibility ? (
        <dl className="mt-3 flex flex-wrap gap-6">
          {hasRegistration ? (
            <div>
              <dt className="text-xs text-slate-500">Placement registration</dt>
              <dd className="mt-1">
                <StatusBadge status={student.placement_registered ? 'registered' : 'not_registered'} />
              </dd>
            </div>
          ) : null}
          {hasEligibility ? (
            <div>
              <dt className="text-xs text-slate-500">Eligibility status</dt>
              <dd className="mt-1">
                <StatusBadge status={student.eligibility_status ?? 'pending'} />
              </dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <p className="mt-2 text-sm text-slate-500">
          Eligibility fields are not deployed yet — they arrive with the M1-2 schema
          extension (migration 20251012000003). Your Placement In-Charge maintains them.
        </p>
      )}
      <p className="mt-3 text-xs text-slate-400">
        Roll number {student.student_number} · {student.departments?.code ?? 'Department not set'} ·
        Batch {student.graduation_year}
      </p>
    </section>
  );
}

function StagePipeline({ application }) {
  const stages = application.drives?.recruitment_stages ?? [];
  const resultByStage = Object.fromEntries(
    (application.application_stage_results ?? []).map((result) => [result.stage_id, result]),
  );
  if (stages.length === 0) return null;
  return (
    <ol className="mt-2 flex flex-wrap gap-2">
      {stages.map((stage, index) => {
        const result = resultByStage[stage.id];
        return (
          <li
            key={stage.id}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600"
            title={result ? `Result published ${new Date(result.published_at).toLocaleString('en-IN')}` : 'Result not published yet'}
          >
            <span className="text-slate-400">{index + 1}.</span>
            {stage.name}
            {result ? <StatusBadge status={result.status} /> : null}
          </li>
        );
      })}
    </ol>
  );
}

export default function StudentApplications() {
  const [student, setStudent] = useState(null);
  const [recordLoading, setRecordLoading] = useState(true);
  const [recordError, setRecordError] = useState(null);
  const applications = useStudentApplications(student?.id ?? null);

  useEffect(() => {
    let cancelled = false;
    authService
      .getStudentRecord()
      .then((record) => {
        if (!cancelled) setStudent(record);
      })
      .catch((error) => {
        if (!cancelled) setRecordError(error);
      })
      .finally(() => {
        if (!cancelled) setRecordLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const registeredCompanies = [
    ...new Set((applications.data ?? []).map((application) => application.drives?.companies?.name).filter(Boolean)),
  ];

  if (recordLoading) return <LoadingState label="Loading your record…" />;
  if (recordError) return <ErrorState title="Could not load your student record" error={recordError} />;
  if (!student) {
    return (
      <ModulePage title="My Applications">
        <EmptyState title="No student record linked">
          Your account is not linked to a student record yet. The Placement In-Charge must
          link your university email to your student record before applications appear here.
        </EmptyState>
      </ModulePage>
    );
  }

  return (
    <ModulePage
      title="My Applications"
      description="Your recruitment history: registered drives, outcomes and published stage results. Unpublished results are never shown here."
    >
      <EligibilityCard student={student} />

      <section aria-label="Registered companies" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Registered companies</h2>
        {applications.loading ? (
          <div className="mt-3"><LoadingState label="Loading…" /></div>
        ) : registeredCompanies.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            You are not registered for any recruitment drive yet.
          </p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {registeredCompanies.map((company) => (
              <li key={company} className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
                {company}
              </li>
            ))}
          </ul>
        )}
      </section>

      {applications.error ? (
        <ErrorState title="Could not load your applications" error={applications.error} />
      ) : applications.loading ? (
        <LoadingState label="Loading your applications…" />
      ) : (applications.data ?? []).length === 0 ? (
        <EmptyState title="No applications yet">
          Once the Placement In-Charge registers you for a drive, it will appear here with
          its stage pipeline and published results.
        </EmptyState>
      ) : (
        <ul className="space-y-4">
          {(applications.data ?? []).map((application) => {
            const hasOffer = (application.offers ?? []).some(
              (offer) => offer.status === 'offered' || offer.status === 'accepted',
            );
            return (
              <li key={application.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-slate-900">
                      {application.drives?.companies?.name ?? 'Company'} — {application.drives?.title}
                    </p>
                    <p className="text-xs text-slate-500">
                      Applied {new Date(application.applied_at).toLocaleDateString('en-IN')}
                      {application.drives?.job_location ? ` · ${application.drives.job_location}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={application.status} />
                    {hasOffer ? <StatusBadge status="offered" /> : null}
                  </div>
                </div>
                <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                  {APPLICATION_STATUS_LABELS[application.status] ?? application.status}
                  {hasOffer ? ' · Offer Received' : ''}
                </p>
                <StagePipeline application={application} />
              </li>
            );
          })}
        </ul>
      )}
    </ModulePage>
  );
}
