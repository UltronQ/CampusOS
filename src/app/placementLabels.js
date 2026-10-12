/**
 * PDF ↔ stored-enum mappings for recruitment (M1-3).
 * The database stores the M3-1 contract enums; the UI presents the PDF's
 * suggested names. Mapping is documented in docs/m1-3-recruitment-screens.md.
 */

/** Drive lifecycle: stored value -> PDF label. */
export const DRIVE_STATUS_LABELS = Object.freeze({
  draft: 'Planned',
  published: 'Open',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
});

/** Stored values offered in drive forms (enum from migrations 0001+0003). */
export const DRIVE_STATUS_VALUES = Object.freeze([
  'draft',
  'published',
  'in_progress',
  'completed',
  'cancelled',
]);

/** Application coarse status: stored value -> PDF label. */
export const APPLICATION_STATUS_LABELS = Object.freeze({
  applied: 'Registered',
  in_progress: 'In Progress',
  selected: 'Selected',
  joined: 'Joined',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
});

export const APPLICATION_STATUS_VALUES = Object.freeze([
  'applied',
  'in_progress',
  'selected',
  'joined',
  'rejected',
  'withdrawn',
]);

/** PDF pre-offer stage pipeline suggested when a drive has no stages yet. */
export const DEFAULT_STAGE_PRESET = Object.freeze([
  'Registered',
  'Eligibility Verified',
  'Shortlisted',
  'Assessment Completed',
  'Interview in Progress',
]);

/**
 * The offer-receiving step is represented by an offers row with status
 * offered/accepted — never by a stage name. Stages beyond the preset are free.
 */
export const STAGE_RESULT_LABELS = Object.freeze({
  pending: 'Pending',
  passed: 'Passed',
  failed: 'Failed',
});

/** No-dues overall status labels (M1-4). */
export const CLEARANCE_OVERALL_LABELS = Object.freeze({
  cleared: 'Cleared',
  pending: 'Pending',
  not_configured: 'Not Configured',
});

/** ₹ paise helpers (integer minor units, half-up display to whole rupees). */
export function rupeesToMinor(rupees) {
  const value = Number(String(rupees).replace(/[, ]/g, ''));
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

export function minorToRupees(minor) {
  if (minor === null || minor === undefined) return null;
  return Number(minor) / 100;
}

export function formatCtc(minor, currency = 'INR') {
  if (minor === null || minor === undefined) return '—';
  const symbol = currency === 'INR' ? '₹' : `${currency} `;
  return `${symbol}${Number(minor).toLocaleString('en-IN')}`;
}
