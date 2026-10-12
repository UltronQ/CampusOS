import { formatCtc } from '../../app/placementLabels';

/**
 * Small presentational dashboard primitives (M1-4). All numbers arrive as
 * props from the analytics service — nothing here computes totals.
 */

export function StatCards({ label, value, sub, tone = 'default' }) {
  const tones = {
    default: 'text-slate-900',
    success: 'text-emerald-700',
    warning: 'text-amber-700',
    danger: 'text-red-700',
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${tones[tone]}`}>{value}</p>
      {sub ? <p className="mt-1 text-xs text-slate-400">{sub}</p> : null}
    </div>
  );
}

/** Renders a contract Rate as a percentage, or an em dash when null. */
export function RateText({ rate }) {
  if (!rate || rate.percent === null || rate.percent === undefined) return <span>—</span>;
  return (
    <span>
      {rate.percent}%{' '}
      <span className="text-xs text-slate-400">
        ({rate.numerator}/{rate.denominator})
      </span>
    </span>
  );
}

export function SectionCard({ title, source, children, actions }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {source ? (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                source === 'member3'
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-slate-100 text-slate-500'
              }`}
              title={
                source === 'member3'
                  ? 'Computed by Member 3 analytics service'
                  : 'Computed from an authorized database snapshot (Member 3 service pending)'
              }
            >
              {source === 'member3' ? 'analytics service' : 'db snapshot'}
            </span>
          ) : null}
        </div>
        {actions}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function SalarySummary({ salary }) {
  if (!salary || salary.count === 0) {
    return <p className="text-sm text-slate-500">No salary data in scope.</p>;
  }
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div>
        <dt className="text-xs text-slate-500">Lowest</dt>
        <dd className="font-semibold tabular-nums">{formatCtc(salary.min_minor, salary.currency)}</dd>
      </div>
      <div>
        <dt className="text-xs text-slate-500">Median</dt>
        <dd className="font-semibold tabular-nums">{formatCtc(salary.median_minor, salary.currency)}</dd>
      </div>
      <div>
        <dt className="text-xs text-slate-500">Mean</dt>
        <dd className="font-semibold tabular-nums">{formatCtc(salary.mean_minor, salary.currency)}</dd>
      </div>
      <div>
        <dt className="text-xs text-slate-500">Highest</dt>
        <dd className="font-semibold tabular-nums">{formatCtc(salary.max_minor, salary.currency)}</dd>
      </div>
    </dl>
  );
}
