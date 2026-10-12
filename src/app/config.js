/**
 * Frontend application configuration.
 * Year bounds are explicit configuration, never machine clock
 * (per docs/data-contracts.md import rules).
 */
export const IMPORT_CONFIG = Object.freeze({
  min_graduation_year: 2026,
  max_graduation_year: 2030,
  max_rows: 1000,
});

/** Proposed eligibility enum — confirm with Member 2 (not in M3-1 contracts). */
export const ELIGIBILITY_STATUSES = Object.freeze(['pending', 'eligible', 'ineligible']);

/** Max rows the directory fetches per request (documented limitation). */
export const DIRECTORY_ROW_LIMIT = 500;
