/**
 * Status badge mapping known CampusOS statuses to consistent colors.
 * Statuses come from src/features/data/contracts.js enums; unknown values
 * render neutrally instead of crashing.
 */

const TONES = {
  // placement / drive lifecycle
  draft: 'bg-slate-100 text-slate-700 ring-slate-200',
  published: 'bg-blue-100 text-blue-800 ring-blue-200',
  completed: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  cancelled: 'bg-slate-200 text-slate-600 ring-slate-300 line-through',
  applied: 'bg-blue-100 text-blue-800 ring-blue-200',
  in_progress: 'bg-amber-100 text-amber-800 ring-amber-200',
  selected: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  rejected: 'bg-red-100 text-red-800 ring-red-200',
  withdrawn: 'bg-slate-100 text-slate-500 ring-slate-200',
  offered: 'bg-blue-100 text-blue-800 ring-blue-200',
  accepted: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  declined: 'bg-red-100 text-red-800 ring-red-200',
  revoked: 'bg-slate-200 text-slate-600 ring-slate-300',
  // clearance lifecycle
  pending: 'bg-amber-100 text-amber-800 ring-amber-200',
  cleared: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  not_applicable: 'bg-slate-100 text-slate-500 ring-slate-200',
  not_configured: 'bg-slate-100 text-slate-600 ring-slate-200',
  // stage results
  passed: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  failed: 'bg-red-100 text-red-800 ring-red-200',
  // student directory (M1-2)
  registered: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  not_registered: 'bg-slate-100 text-slate-600 ring-slate-200',
  eligible: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  ineligible: 'bg-red-100 text-red-800 ring-red-200',
  // checklist configuration (M1-4)
  mandatory: 'bg-amber-100 text-amber-800 ring-amber-200',
  optional: 'bg-slate-100 text-slate-600 ring-slate-200',
  inactive: 'bg-slate-200 text-slate-500 ring-slate-300',
};

const DEFAULT_TONE = 'bg-slate-100 text-slate-600 ring-slate-200';

export function StatusBadge({ status, tone: toneOverride, className = '' }) {
  if (status === null || status === undefined || status === '') return null;
  const tone = toneOverride
    ? {
        success: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
        warning: 'bg-amber-100 text-amber-800 ring-amber-200',
        danger: 'bg-red-100 text-red-800 ring-red-200',
        neutral: 'bg-slate-100 text-slate-600 ring-slate-200',
      }[toneOverride] ?? TONES[status]
    : TONES[status] ?? DEFAULT_TONE;
  const label = String(status).replace(/_/g, ' ');
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${tone} ${className}`}
    >
      {label}
    </span>
  );
}

export default StatusBadge;
