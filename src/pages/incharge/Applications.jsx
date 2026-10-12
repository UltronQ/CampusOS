import { useMemo, useState } from 'react';
import ModulePage from '../../components/layout/ModulePage';
import DataTable from '../../components/ui/DataTable';
import StatusBadge from '../../components/ui/StatusBadge';
import FormField from '../../components/ui/FormField';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States';
import { useApplications, useDrives, useAsyncData } from '../../hooks/usePlacement';
import * as recruitmentService from '../../services/recruitmentService';
import * as driveService from '../../services/driveService';
import * as studentService from '../../services/studentService';
import {
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_VALUES,
  STAGE_RESULT_LABELS,
  rupeesToMinor,
  formatCtc,
} from '../../app/placementLabels';

/**
 * Module 3 — Applications, stages and offers (Placement In-Charge).
 * Registered student list per drive, stage-result publishing (which makes a
 * result visible to the student), coarse application outcomes (Selected /
 * Rejected / Withdrawn / Joined) and offer recording with revoke.
 * All persistence goes through Member 2 services + the documented Member 1
 * extension; every write result is surfaced, never faked.
 */

function StageControls({ application, onPublish, busy }) {
  const stages = application.drives?.recruitment_stages ?? [];
  const resultByStage = Object.fromEntries(
    (application.application_stage_results ?? []).map((result) => [result.stage_id, result]),
  );
  if (stages.length === 0) {
    return <span className="text-xs text-slate-400">No stages configured</span>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {stages.map((stage, index) => {
        const result = resultByStage[stage.id];
        return (
          <label
            key={stage.id}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
            title={result?.published_at ? 'Published to the student' : 'Not yet published'}
          >
            <span className="text-slate-500">
              {index + 1}. {stage.name}
            </span>
            <select
              aria-label={`Result for stage ${stage.name}`}
              value={result?.status ?? ''}
              disabled={busy}
              onChange={(event) => onPublish(application, stage, event.target.value)}
              className={`rounded border px-1 py-0.5 text-xs ${
                result?.published_at ? 'border-emerald-300 bg-emerald-50' : 'border-slate-300'
              }`}
            >
              <option value="">—</option>
              {Object.entries(STAGE_RESULT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        );
      })}
    </div>
  );
}

function OfferModal({ application, onClose, onRecorded }) {
  const [rupees, setRupees] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleRecord(event) {
    event.preventDefault();
    setError(null);
    const minor = rupeesToMinor(rupees);
    if (minor === null) {
      setError(new Error('Enter the annual package as a non-negative rupee amount.'));
      return;
    }
    setBusy(true);
    try {
      await recruitmentService.createOffer(application.id, {
        status: 'offered',
        annual_ctc_minor: minor,
        currency: 'INR',
      });
      onRecorded();
    } catch (err) {
      setError(new Error(err?.message ?? 'Could not record the offer.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title={`Record offer — ${application.students?.full_name ?? 'student'}`}
    >
      <p className="text-sm text-slate-500">
        {application.drives?.companies?.name} · {application.drives?.title}
      </p>
      {error ? (
        <div className="mt-3">
          <ErrorState title="Offer not recorded" error={error} />
        </div>
      ) : null}
      <form onSubmit={handleRecord} className="mt-4 space-y-4" noValidate>
        <FormField
          label="Annual package (₹)"
          inputMode="numeric"
          value={rupees}
          onChange={(event) => setRupees(event.target.value)}
          placeholder="e.g. 600000"
          disabled={busy}
          required
        />
        <p className="text-xs text-slate-500">
          Multiple offers per student are supported and counted separately in analytics.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" busy={busy}>
            Record offer
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function RegisterStudentModal({ drives, onClose, onRegistered }) {
  const students = useAsyncData(() => studentService.listStudents(), []);
  const [studentId, setStudentId] = useState('');
  const [driveId, setDriveId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleRegister(event) {
    event.preventDefault();
    setError(null);
    if (!studentId || !driveId) {
      setError(new Error('Select both a student and a drive.'));
      return;
    }
    setBusy(true);
    try {
      await recruitmentService.applyToDrive(studentId, driveId);
      onRegistered();
    } catch (err) {
      setError(
        new Error(
          err?.code === '23505'
            ? 'This student is already registered for that drive.'
            : err?.message ?? 'Could not register the student.',
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={busy ? () => {} : onClose} title="Register student to drive">
      {students.error ? <ErrorState title="Students unavailable" error={students.error} /> : null}
      {error ? <ErrorState title="Registration failed" error={error} /> : null}
      <form onSubmit={handleRegister} className="mt-2 space-y-4" noValidate>
        <FormField
          label="Student"
          as="select"
          value={studentId}
          onChange={(event) => setStudentId(event.target.value)}
          disabled={busy || students.loading}
          required
        >
          <option value="">Select student…</option>
          {(students.data ?? []).map((student) => (
            <option key={student.id} value={student.id}>
              {student.student_number} — {student.full_name} ({student.departments?.code ?? '—'})
            </option>
          ))}
        </FormField>
        <FormField
          label="Drive"
          as="select"
          value={driveId}
          onChange={(event) => setDriveId(event.target.value)}
          disabled={busy}
          required
        >
          <option value="">Select drive…</option>
          {drives.map((drive) => (
            <option key={drive.id} value={drive.id}>
              {drive.companies?.name} — {drive.title}
            </option>
          ))}
        </FormField>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" busy={busy}>
            Register
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function Applications() {
  const [driveFilter, setDriveFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const applications = useApplications(driveFilter || null);
  const drives = useDrives();
  const [stageBusy, setStageBusy] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [offerTarget, setOfferTarget] = useState(null);
  const [registerOpen, setRegisterOpen] = useState(false);

  const rows = useMemo(() => {
    if (!applications.data) return [];
    return applications.data.filter((application) => {
      if (statusFilter && application.status !== statusFilter) return false;
      if (search.trim()) {
        const term = search.trim().toLowerCase();
        const haystack = `${application.students?.full_name ?? ''} ${application.students?.student_number ?? ''}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [applications.data, statusFilter, search]);

  async function handlePublish(application, stage, status) {
    if (!status) return;
    setStageBusy(true);
    setActionError(null);
    try {
      await recruitmentService.publishStageResult(application.id, stage.id, status);
      applications.reload();
    } catch (err) {
      setActionError(new Error(err?.message ?? 'Could not publish the stage result.'));
    } finally {
      setStageBusy(false);
    }
  }

  async function handleStatusChange(application, status) {
    setActionError(null);
    try {
      await driveService.setApplicationStatus(application.id, status);
      applications.reload();
    } catch (err) {
      setActionError(new Error(err?.message ?? 'Could not update the application.'));
    }
  }

  async function handleRevoke(offer) {
    setActionError(null);
    try {
      await recruitmentService.updateOfferStatus(offer.id, 'revoked');
      applications.reload();
    } catch (err) {
      setActionError(new Error(err?.message ?? 'Could not revoke the offer.'));
    }
  }

  const columns = [
    {
      key: 'student',
      label: 'Student',
      render: (row) => (
        <div>
          <p className="font-medium text-slate-800">{row.students?.full_name ?? '—'}</p>
          <p className="font-mono text-xs text-slate-500">{row.students?.student_number}</p>
        </div>
      ),
    },
    {
      key: 'drive',
      label: 'Drive',
      render: (row) => (
        <div className="text-xs">
          <p className="font-medium text-slate-700">{row.drives?.companies?.name ?? '—'}</p>
          <p className="text-slate-500">{row.drives?.title}</p>
        </div>
      ),
    },
    {
      key: 'applied_at',
      label: 'Applied',
      render: (row) => (
        <span className="text-xs">{new Date(row.applied_at).toLocaleDateString('en-IN')}</span>
      ),
    },
    {
      key: 'stages',
      label: 'Stage results (published on save)',
      render: (row) => (
        <StageControls application={row} onPublish={handlePublish} busy={stageBusy} />
      ),
    },
    {
      key: 'status',
      label: 'Outcome',
      render: (row) => (
        <select
          aria-label={`Outcome for ${row.students?.full_name ?? 'student'}`}
          value={row.status}
          onChange={(event) => handleStatusChange(row, event.target.value)}
          className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
        >
          {APPLICATION_STATUS_VALUES.map((status) => (
            <option key={status} value={status}>
              {APPLICATION_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      ),
    },
    {
      key: 'offers',
      label: 'Offers',
      render: (row) =>
        (row.offers ?? []).length === 0 ? (
          <span className="text-xs text-slate-400">None</span>
        ) : (
          <ul className="space-y-1">
            {(row.offers ?? []).map((offer) => (
              <li key={offer.id} className="flex items-center gap-2 text-xs">
                <StatusBadge status={offer.status} />
                <span>{formatCtc(offer.annual_ctc_minor, offer.currency)}</span>
                {offer.status === 'offered' || offer.status === 'accepted' ? (
                  <button
                    type="button"
                    onClick={() => handleRevoke(offer)}
                    className="text-red-600 underline hover:text-red-800"
                  >
                    revoke
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (row) => (
        <Button variant="ghost" onClick={() => setOfferTarget(row)} aria-label={`Record offer for ${row.students?.full_name ?? 'student'}`}>
          + Offer
        </Button>
      ),
    },
  ];

  return (
    <ModulePage
      title="Applications"
      description="Registered students per drive, recruitment-stage results (published to students on save), outcomes and offers. Students only ever see published results — enforced by RLS, not by this screen."
    >
      {actionError ? (
        <ErrorState title="Last operation failed" error={actionError} actions={
          <Button variant="secondary" onClick={() => setActionError(null)}>Dismiss</Button>
        } />
      ) : null}

      <section aria-label="Filters" className="flex flex-wrap items-end gap-3">
        <FormField
          label="Drive"
          as="select"
          value={driveFilter}
          onChange={(event) => setDriveFilter(event.target.value)}
          className="w-64"
        >
          <option value="">All drives</option>
          {(drives.data ?? []).map((drive) => (
            <option key={drive.id} value={drive.id}>
              {drive.companies?.name} — {drive.title}
            </option>
          ))}
        </FormField>
        <FormField
          label="Outcome"
          as="select"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="w-44"
        >
          <option value="">All outcomes</option>
          {APPLICATION_STATUS_VALUES.map((status) => (
            <option key={status} value={status}>
              {APPLICATION_STATUS_LABELS[status]}
            </option>
          ))}
        </FormField>
        <FormField
          label="Search student"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Name or roll number"
          className="w-56"
        />
        <Button onClick={() => setRegisterOpen(true)}>Register student</Button>
      </section>

      {applications.loading ? (
        <LoadingState label="Loading applications…" />
      ) : applications.error ? (
        <ErrorState title="Applications unavailable" error={applications.error} />
      ) : rows.length === 0 ? (
        <EmptyState title="No applications match">
          Register a student to a drive, or adjust the filters above.
        </EmptyState>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          caption="Applications with stage results and offers"
        />
      )}

      {offerTarget ? (
        <OfferModal
          application={offerTarget}
          onClose={() => setOfferTarget(null)}
          onRecorded={() => {
            setOfferTarget(null);
            applications.reload();
          }}
        />
      ) : null}

      {registerOpen ? (
        <RegisterStudentModal
          drives={drives.data ?? []}
          onClose={() => setRegisterOpen(false)}
          onRegistered={() => {
            setRegisterOpen(false);
            applications.reload();
            drives.reload();
          }}
        />
      ) : null}
    </ModulePage>
  );
}
