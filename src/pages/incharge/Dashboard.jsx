import { useEffect, useMemo, useState } from 'react';
import Button from '../../components/ui/Button';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from 'recharts';
import ModulePage from '../../components/layout/ModulePage';
import DashboardFilters, { EMPTY_PLACEMENT_FILTERS } from '../../components/dashboard/DashboardFilters';
import { StatCards, RateText, SectionCard, SalarySummary } from '../../components/dashboard/StatCards';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States';
import { useDepartments } from '../../hooks/useStudents';
import { useCompanies } from '../../hooks/usePlacement';
import { getPlacementAnalytics, getNoDuesAnalytics } from '../../services/analyticsService';

/**
 * Module 4 — Placement In-Charge dashboard.
 *
 * Placement figures come from Member 3's consistent database snapshot engine.
 * No-dues retains its assigned service boundary. This page renders supplied
 * metrics; it never derives student placements by counting application rows.
 */

function DepartmentPlacementChart({ rows }) {
  const data = rows.map((row) => ({
    code: row.department_code,
    percent: row.placement_rate.percent,
    placed: row.placed_students,
    eligible: row.eligible_students,
  }));
  if (data.length === 0) return <EmptyState title="No departments in scope" />;
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="code" tick={{ fontSize: 12 }} />
          <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 12 }} />
          <Tooltip formatter={(value) => [`${value}%`, 'Placement rate']} />
          <Bar dataKey="percent" radius={[4, 4, 0, 0]}>
            {data.map((entry, index) => (
              <Cell key={index} fill={entry.percent >= 50 ? '#059669' : entry.percent > 0 ? '#d97706' : '#94a3b8'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function CompanyOutcomesChart({ rows }) {
  const data = rows.map((row) => ({ name: row.company_name, selected: row.selections, placed: row.placed_students, offers: row.offers }));
  if (data.length === 0) return <EmptyState title="No company outcomes in scope" />;
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={50} />
          <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
          <Tooltip />
          <Bar dataKey="selected" name="Students selected" fill="#059669" radius={[4, 4, 0, 0]} />
          <Bar dataKey="placed" name="Students placed" fill="#4f46e5" radius={[4, 4, 0, 0]} />
          <Bar dataKey="offers" name="Offers" fill="#c7d2fe" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function InchargeDashboard() {
  const departments = useDepartments();
  const companies = useCompanies();
  const [filters, setFilters] = useState(EMPTY_PLACEMENT_FILTERS);
  const [refresh, setRefresh] = useState(0);
  const [placement, setPlacement] = useState({ loading: true, data: null, source: 'snapshot', error: null });
  const [noDues, setNoDues] = useState({ loading: true, data: null, source: 'snapshot', error: null });

  useEffect(() => {
    const update = () => setRefresh((value) => value + 1);
    const timer = window.setInterval(update, 30000);
    window.addEventListener('focus', update);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', update); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setPlacement((prev) => ({ ...prev, loading: true, error: null }));
    getPlacementAnalytics(filters)
      .then((result) => {
        if (!cancelled) setPlacement({ loading: false, data: result.data, source: result.source, error: null });
      })
      .catch((error) => {
        if (!cancelled) setPlacement({ loading: false, data: null, source: 'snapshot', error });
      });
    return () => {
      cancelled = true;
    };
  }, [filters, refresh]);

  useEffect(() => {
    let cancelled = false;
    setNoDues((prev) => ({ ...prev, loading: true, error: null }));
    const ndFilters = { department_ids: filters.department_ids, graduation_years: filters.graduation_years };
    getNoDuesAnalytics(ndFilters)
      .then((result) => {
        if (!cancelled) setNoDues({ loading: false, data: result.data, source: result.source, error: null });
      })
      .catch((error) => {
        if (!cancelled) setNoDues({ loading: false, data: null, source: 'snapshot', error });
      });
    return () => {
      cancelled = true;
    };
  }, [filters]);

  const p = placement.data;
  const nd = noDues.data;
  const multiOfferNote = useMemo(() => {
    if (!p) return null;
    return `${p.students_with_multiple_offers} student(s) hold more than one offer`;
  }, [p]);

  return (
    <ModulePage
      title="Placement Dashboard"
      description="Placement statistics from a consistent database snapshot. Refreshes every 30 seconds and when you return to this window."
    >
      <DashboardFilters
        departments={departments.data ?? []}
        companies={companies.data ?? []}
        graduationYears={p?.available_graduation_years ?? []}
        value={filters}
        onChange={setFilters}
      />
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
        <span>{p ? 'Updated ' + new Date(p.snapshot_at).toLocaleString() : 'Awaiting database snapshot'}</span>
        <Button variant="secondary" disabled={placement.loading} onClick={() => setRefresh((value) => value + 1)}>Refresh placement analytics</Button>
      </div>

      {placement.error ? (
        <ErrorState title="Placement analytics unavailable" error={placement.error} />
      ) : placement.loading ? (
        <LoadingState label="Loading placement analytics…" />
      ) : !p ? (
        <EmptyState title="No placement data">Adjust the filters or add placement records.</EmptyState>
      ) : (
        <>
          <SectionCard title="Placement performance" source={placement.source}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCards label="Placement rate" value={<RateText rate={p.placement_rate} />} sub="unique placed ÷ selected student cohort" />
              <StatCards label="Placed students" value={p.placed_students} tone="success" sub={multiOfferNote} />
              <StatCards label="Not yet placed" value={p.unplaced_students} tone={p.unplaced_students > 0 ? 'warning' : 'default'} sub={`${p.total_students} students in cohort`} />
              <StatCards label="Total offers" value={p.successful_offers} sub={`${p.applications} application(s) in scope`} />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <StatCards label="Registered students" value={p.registered_students} sub="placement registration recorded" />
              <StatCards label="Eligible students" value={p.eligible_students} sub="meet criteria for at least one scoped active drive" />
              <StatCards label="Participating students" value={p.participating_students} sub="distinct students with non-withdrawn applications" />
            </div>
            <p className="mt-3 text-sm text-slate-600">Placement percentage uses all students in the selected department and graduation batch. Company and recruitment-status filters narrow outcomes, while the cohort denominator stays fixed.</p>
            <div className="mt-5">
              <h3 className="text-sm font-semibold text-slate-700">Package summary</h3>
              <div className="mt-2">
                <SalarySummary salary={p.salary} />
                <p className="mt-2 text-xs text-slate-500">INR packages only; averages are per valid offer. {p.excluded_package_offers} offer(s) have no usable compensation data.</p>
                {p.salary_by_currency.filter((salary) => salary.currency !== 'INR').map((salary) => (
                  <div key={salary.currency} className="mt-3"><p className="text-sm font-medium">{salary.currency} packages (separate currency)</p><SalarySummary salary={salary} /></div>
                ))}
              </div>
            </div>
          </SectionCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Department placement %" source={placement.source}>
              <DepartmentPlacementChart rows={p.by_department} />
            </SectionCard>
            <SectionCard title="Company outcomes" source={placement.source}>
              <CompanyOutcomesChart rows={p.companies ?? []} />
            </SectionCard>
          </div>

          <SectionCard title="Graduation batch trends" source={placement.source}>
            {p.batch_trends.length < 2 ? <p className="text-sm text-slate-500">At least two stored graduation batches are required to compare placement trends.</p> : (
              <div className="overflow-x-auto"><table className="min-w-full text-sm">
                <thead><tr className="text-left"><th className="p-2">Batch</th><th className="p-2">Students</th><th className="p-2">Placed</th><th className="p-2">Offers</th><th className="p-2">Placement %</th></tr></thead>
                <tbody>{p.batch_trends.map((row) => <tr key={row.graduation_year}><td className="p-2">{row.graduation_year}</td><td className="p-2">{row.total_students}</td><td className="p-2">{row.placed_students}</td><td className="p-2">{row.successful_offers}</td><td className="p-2"><RateText rate={row.placement_rate} /></td></tr>)}</tbody>
              </table></div>
            )}
          </SectionCard>

          <SectionCard title="Department breakdown" source={placement.source}>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-4">Department</th>
                    <th className="py-2 pr-4 text-right">Cohort</th>
                    <th className="py-2 pr-4 text-right">Eligible</th>
                    <th className="py-2 pr-4 text-right">Placed</th>
                    <th className="py-2 pr-4 text-right">Unplaced</th>
                    <th className="py-2 pr-4 text-right">Offers</th>
                    <th className="py-2 text-right">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {p.by_department.map((row) => (
                    <tr key={row.department_id} className="border-b border-slate-100">
                      <td className="py-2 pr-4 font-medium">{row.department_code}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{row.total_students}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{row.eligible_students}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{row.placed_students}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{row.unplaced_students}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{row.successful_offers}</td>
                      <td className="py-2 text-right"><RateText rate={row.placement_rate} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </>
      )}

      {noDues.error ? (
        <ErrorState title="No-dues analytics unavailable" error={noDues.error} />
      ) : noDues.loading ? (
        <LoadingState label="Loading no-dues analytics…" />
      ) : !nd ? (
        <EmptyState title="No clearance data" />
      ) : (
        <SectionCard title="No-dues completion" source={noDues.source}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCards label="Clearance rate" value={<RateText rate={nd.clearance_rate} />} sub="fully cleared ÷ cohort" />
            <StatCards label="Fully cleared" value={nd.cleared_students} tone="success" />
            <StatCards label="Pending" value={nd.pending_students} tone={nd.pending_students > 0 ? 'warning' : 'default'} />
            <StatCards label="Not configured" value={nd.not_configured_students} sub="no mandatory checklist yet" />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            <StatCards label="Cleared items" value={nd.mandatory_items.cleared} tone="success" />
            <StatCards label="Not applicable" value={nd.mandatory_items.not_applicable} />
            <StatCards label="Pending items" value={nd.mandatory_items.pending} tone="warning" />
            <StatCards label="Missing items" value={nd.mandatory_items.missing} tone="danger" />
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4">Department</th>
                  <th className="py-2 pr-4 text-right">Cohort</th>
                  <th className="py-2 pr-4 text-right">Cleared</th>
                  <th className="py-2 pr-4 text-right">Pending</th>
                  <th className="py-2 pr-4 text-right">Not configured</th>
                  <th className="py-2 text-right">Rate</th>
                </tr>
              </thead>
              <tbody>
                {nd.by_department.map((row) => (
                  <tr key={row.department_id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 font-medium">{row.department_code}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{row.total_students}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{row.cleared_students}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{row.pending_students}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{row.not_configured_students}</td>
                    <td className="py-2 text-right"><RateText rate={row.clearance_rate} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </ModulePage>
  );
}
