import { useEffect, useState } from 'react';
import ModulePage from '../../components/layout/ModulePage';
import DataTable from '../../components/ui/DataTable';
import StatusBadge from '../../components/ui/StatusBadge';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States';
import { useStudentApplications } from '../../hooks/usePlacement';
import * as authService from '../../services/authService';
import { formatCtc } from '../../app/placementLabels';

/**
 * Module 3 — Published offers (own records only).
 * Offers rows reach this screen only through RLS (own applications).
 * Acceptance/decline is recorded by the Placement In-Charge today — students
 * have read access to offers but no UPDATE policy yet (see docs/m1-3).
 */
export default function StudentOffers() {
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

  if (recordLoading) return <LoadingState label="Loading your record…" />;
  if (recordError) return <ErrorState title="Could not load your student record" error={recordError} />;
  if (!student) {
    return (
      <ModulePage title="My Offers">
        <EmptyState title="No student record linked">
          Your account is not linked to a student record yet, so no offers can appear here.
        </EmptyState>
      </ModulePage>
    );
  }

  const offers = (applications.data ?? []).flatMap((application) =>
    (application.offers ?? []).map((offer) => ({
      ...offer,
      company: application.drives?.companies?.name ?? '—',
      drive: application.drives?.title ?? '—',
    })),
  );

  const columns = [
    { key: 'company', label: 'Company' },
    { key: 'drive', label: 'Drive' },
    {
      key: 'annual_ctc_minor',
      label: 'Annual package',
      align: 'right',
      render: (row) => formatCtc(row.annual_ctc_minor, row.currency),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'created_at',
      label: 'Recorded',
      render: (row) => (
        <span className="text-xs">{new Date(row.created_at).toLocaleDateString('en-IN')}</span>
      ),
    },
  ];

  return (
    <ModulePage
      title="My Offers"
      description="Offers recorded against your applications. Multiple offers are listed separately — revoked or declined offers remain visible for transparency."
    >
      {applications.loading ? (
        <LoadingState label="Loading your offers…" />
      ) : applications.error ? (
        <ErrorState title="Could not load your offers" error={applications.error} />
      ) : offers.length === 0 ? (
        <EmptyState title="No offers yet">
          Offers appear here once the Placement In-Charge records them against your
          application after selection.
        </EmptyState>
      ) : (
        <DataTable
          columns={columns}
          rows={offers}
          rowKey={(row) => row.id}
          caption="Your published offers"
        />
      )}
    </ModulePage>
  );
}
