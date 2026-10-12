/**
 * CampusOS shared contracts aligned with the phase-one database migrations.
 * Plain JavaScript + JSDoc: no TypeScript build required. IDs are opaque strings.
 * Records and authorization come from Supabase; never trust a client role filter.
 * Money is integer minor units (INR paise), never floating-point currency.
 */
export const DATA_CONTRACT_VERSION = '1.4.0';
export const USER_ROLES = Object.freeze(['placement_incharge', 'student']);
export const IMPORT_HEADERS = Object.freeze([
  'student_number', 'full_name', 'email', 'department_code',
  'graduation_year', 'cgpa', 'phone', 'backlogs',
]);
export const APPLICATION_STATUSES = Object.freeze([
  'applied', 'in_progress', 'selected', 'rejected', 'withdrawn',
]);
export const DRIVE_STATUSES = Object.freeze(['draft', 'published', 'completed', 'cancelled']);
export const OFFER_STATUSES = Object.freeze(['offered', 'accepted', 'declined', 'revoked']);
export const CLEARANCE_STATUSES = Object.freeze(['pending', 'cleared', 'not_applicable', 'rejected']);
export const CLEARANCE_STATUS_LABELS = Object.freeze({
  pending: 'Pending', cleared: 'Cleared', not_applicable: 'Not Applicable',
  rejected: 'Rejected / Further Action Required',
});
export const NO_DUES_OVERALL_STATUSES = Object.freeze(['cleared', 'incomplete', 'not_configured']);

/** @typedef {string} ID */
/** @typedef {'placement_incharge'|'student'} UserRole */
/** @typedef {'draft'|'published'|'completed'|'cancelled'} DriveStatus */
/** @typedef {'pending'|'cleared'|'not_applicable'|'rejected'} ClearanceStatus */
/** Legacy analytics DTO; map the workflow's incomplete bucket to pending. */
/** @typedef {'pending'|'cleared'|'not_configured'} OverallClearanceStatus */
/** @typedef {'cleared'|'incomplete'|'not_configured'} NoDuesOverallStatus */
/**
 * M2-4 statement items include every active category, including optional ones.
 * Missing decisions are synthesized as pending with is_missing=true and null audit fields.
 * @typedef {Object} NoDuesStatementItem
 * @property {ID} clearance_item_id
 * @property {string} name
 * @property {boolean} is_mandatory
 * @property {ID|null} student_clearance_id
 * @property {ClearanceStatus} status
 * @property {boolean} is_missing
 * @property {string|null} remarks
 * @property {string[]} pending_requirements
 * @property {ID|null} approved_by
 * @property {string|null} approved_at
 * @property {ID|null} updated_by
 * @property {string|null} updated_at
 * @property {string} category_updated_at
 */
/** @typedef {{mandatory_total:number, mandatory_cleared:number, mandatory_not_applicable:number, mandatory_pending:number, mandatory_rejected:number, mandatory_missing:number}} NoDuesMandatoryCounts */
/** @typedef {NoDuesMandatoryCounts & {student_id:ID, student_number:string, full_name:string, department_id:ID, department_code:string, graduation_year:number, overall_status:NoDuesOverallStatus, items:NoDuesStatementItem[], snapshot_at:string}} NoDuesStatement */
/** @typedef {NoDuesMandatoryCounts & {total_students:number, cleared_students:number, incomplete_students:number, not_configured_students:number, clearance_rate:Rate}} NoDuesProgressTotals */
/** @typedef {NoDuesProgressTotals & {department_id:ID, department_code:string}} NoDuesDepartmentProgress */
/** @typedef {NoDuesProgressTotals & {graduation_year:number}} NoDuesBatchProgress */
/** @typedef {{snapshot_at:string, totals:NoDuesProgressTotals, by_department:NoDuesDepartmentProgress[], by_batch:NoDuesBatchProgress[], by_department_batch:(NoDuesDepartmentProgress & NoDuesBatchProgress)[]}} NoDuesProgress */
/** @typedef {{code:string, field:string|null, message:string, source_row?:number|null}} ValidationIssue */
/**
 * Spreadsheet row number includes header (first data row = 2).
 * Preserve student_number and phone as text; do not lose leading zeroes.
 * email is trimmed/lowercased, department_code trimmed/uppercased.
 * Blank optional cells become null. No auth account is created by importing.
 * @typedef {Object} StudentImportRow
 * @property {string} student_number
 * @property {string} full_name
 * @property {string} email
 * @property {string} department_code
 * @property {number} graduation_year
 * @property {number|null} cgpa
 * @property {string|null} phone
 * @property {number|null} backlogs Nonnegative integer; null means unknown.
 */
/** @typedef {{source_row:number, raw:Record<string,unknown>, normalized:StudentImportRow|null, errors:ValidationIssue[], warnings:ValidationIssue[]}} ImportRowValidation */
/**
 * @typedef {Object} ImportValidationContext
 * @property {{id:ID, code:string}[]} departments Database-backed allowed departments.
 * @property {{id:ID, student_number:string, email:string}[]} existing_students Authorized DB records.
 * @property {number} min_graduation_year Explicit configuration; never machine clock.
 * @property {number} max_graduation_year
 * @property {number} max_rows
 */
/** @typedef {{contract_version:string, rows:ImportRowValidation[], file_errors:ValidationIssue[], total_rows:number, valid_rows:number, invalid_rows:number, duplicate_rows:number, warning_rows:number, can_commit:boolean, can_commit_partial:boolean, filename:string, sheet_name:string|null, truncated:boolean}} ImportValidationResult */
/** @typedef {{source_row:number, action:'insert', student:StudentImportRow, department_id:ID}} ImportPreviewRow */
/**
 * Preview is not a persistence guarantee: Member 2 revalidates in a transaction.
 * @typedef {Object} ImportPreviewResult
 * @property {ImportValidationResult} validation
 * @property {ImportPreviewRow[]} rows All eligible rows (UI may paginate).
 * @property {number} insert_count
 * @property {number} blocked_count
 * @property {'insert_only_atomic'|'insert_only_partial'} mode
 * @property {boolean} can_commit Selected mode may be committed after confirmation.
 */
/** @typedef {{source_row:number, student_id:ID}} ImportedStudent */
/** @typedef {{source_row:number, status:'successful'|'skipped'|'failed', student_id?:ID, errors:ValidationIssue[]}} ImportRowOutcome */
/** @typedef {{confirmed:boolean, mode?:'atomic'|'partial'}} ImportCommitOptions */
/**
 * successful + skipped + failed = total. duplicate_count is a subset, not an
 * extra outcome. Atomic rejection skips otherwise-valid rows and inserts zero.
 * @typedef {{committed:boolean, inserted_count:number, successful_count:number, skipped_count:number, failed_count:number, duplicate_count:number, total_count:number, mode:'atomic'|'partial', history_id:ID, students:ImportedStudent[], errors:ValidationIssue[], row_results:ImportRowOutcome[]}} ImportCommitResult
 */
/**
 * Empty arrays mean no constraint. Filters intersect. Dates are ISO calendar dates,
 * inclusive, applied to drives.start_date, never offer creation dates.
 * @typedef {Object} PlacementAnalyticsFilters
 * @property {ID[]} department_ids
 * @property {number[]} graduation_years
 * @property {ID[]} company_ids
 * @property {ID[]} drive_ids
 * @property {string|null} drive_start_from YYYY-MM-DD.
 * @property {string|null} drive_start_to YYYY-MM-DD.
 * @property {DriveStatus[]} drive_statuses Empty = published/completed. Draft/cancelled never contribute successes.
 */
/** @typedef {{department_ids:ID[], graduation_years:number[]}} NoDuesAnalyticsFilters */
/** @typedef {{numerator:number, denominator:number, percent:number|null}} Rate */
/** @typedef {{count:number, min_minor:number|null, max_minor:number|null, mean_minor:number|null, median_minor:number|null, currency:string}} SalaryStatistics */
/** @typedef {{department_id:ID, department_code:string, total_students:number, registered_students:number, eligible_students:number, participating_students:number, placed_students:number, unplaced_students:number, placement_rate:Rate, successful_offers:number}} DepartmentPlacementSummary */
/**
 * successful_offers includes offered/accepted only; placed_students is distinct
 * student IDs in those offers after all joins/exclusions. Salary is offer-weighted.
 * @typedef {Object} PlacementAnalyticsOutput
 * @property {string} contract_version
 * @property {string} snapshot_at Server timestamp, metadata only.
 * @property {PlacementAnalyticsFilters} filters Canonical validated filters.
 * @property {number[]} available_graduation_years Actual stored batches, before cohort filtering.
 * @property {number} total_students Entire selected student cohort.
 * @property {number} registered_students Cohort students with placement_registered=true.
 * @property {number} eligible_students Distinct cohort students satisfying stored criteria for at least one scoped active drive, even without applications.
 * @property {number} participating_students Distinct cohort students with non-withdrawn applications to scoped active drives.
 * @property {number} placed_students
 * @property {number} unplaced_students total_students minus placed_students.
 * @property {'cohort_students'} placement_denominator Placement percentage uses the complete department/batch cohort.
 * @property {Rate} placement_rate
 * @property {number} applications Non-withdrawn applications in scoped eligible drives.
 * @property {number} successful_offers
 * @property {number} students_with_multiple_offers
 * @property {SalaryStatistics} salary INR offer-weighted packages; no currency conversion.
 * @property {SalaryStatistics[]} salary_by_currency Independent currency groups.
 * @property {number} excluded_package_offers Successful offers missing valid safe-integer compensation or currency.
 * @property {{company_id:ID, company_name:string, selections:number, selected_applications:number, placed_students:number, offers:number}[]} companies Selections are unique selected students, independently of offers.
 * @property {{graduation_year:number, total_students:number, registered_students:number, eligible_students:number, participating_students:number, placed_students:number, unplaced_students:number, placement_rate:Rate, successful_offers:number}[]} batch_trends Empty unless at least two graduation batches exist in the cohort.
 * @property {DepartmentPlacementSummary[]} by_department Sorted by department_code then ID.
 */
/** @typedef {{department_id:ID, department_code:string, total_students:number, cleared_students:number, pending_students:number, not_configured_students:number, clearance_rate:Rate}} DepartmentClearanceSummary */
/**
 * @typedef {Object} NoDuesAnalyticsOutput
 * @property {string} contract_version
 * @property {string} snapshot_at
 * @property {NoDuesAnalyticsFilters} filters
 * @property {number} total_students
 * @property {number} cleared_students
 * @property {number} pending_students
 * @property {number} not_configured_students
 * @property {Rate} clearance_rate Cleared / total, includes unconfigured in denominator.
 * @property {{cleared:number, not_applicable:number, pending:number, missing:number}} mandatory_items Missing is separate from persisted pending.
 * @property {DepartmentClearanceSummary[]} by_department
 */
/**
 * Statements always contain overall_status calculated from all applicable
 * mandatory items, even when displayed item columns are narrowed.
 * @typedef {Object} ReportExportInput
 * @property {'department_placement'|'company_outcomes'|'student_placement_history'|'unplaced_students'|'pending_no_dues'|'no_dues_statement'|'batch_placement_summary'|'placement_summary'|'placement_offers'} kind
 * @property {'csv'|'xlsx'} format
 * @property {PlacementAnalyticsFilters|NoDuesAnalyticsFilters} filters Validated against kind.
 * @property {ID[]} student_ids Optional narrowing for report rows; empty means all authorized.
 * @property {string[]} columns Allowlisted ordered columns; empty means documented defaults.
 */
/**
 * Returns a real file from an authorized snapshot; UI downloads blob.
 * CSV row_count excludes header. XLSX row_count sums data rows across sheets.
 * @typedef {Object} ReportExportOutput
 * @property {string} contract_version
 * @property {string} snapshot_at
 * @property {string} filename Safe basename, no student names in filename.
 * @property {'text/csv;charset=utf-8'|'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'} mime_type
 * @property {Blob} blob
 * @property {number} row_count
 * @property {number} report_row_count Primary report records; excludes XLSX checklist/metadata sheet rows.
 * @property {string[]} columns Actual ordered output columns.
 * @property {{name:string, row_count:number}[]} sheets CSV = one sheet named Report.
 * @property {string[]} warnings
 */
/** @typedef {{contract_version:string, title:string, kind:ReportExportInput['kind'], snapshot_at:string, filters:PlacementAnalyticsFilters|NoDuesAnalyticsFilters, student_ids:ID[], filter_summary:string[], columns:{key:string,heading:string}[], rows:Object[], row_count:number, item_rows:Object[], item_columns:{key:string,heading:string}[], placement_denominator:'cohort_students'|null}} ReportResult */
/** @typedef {{code:'INVALID_INPUT'|'UNAUTHORIZED'|'FORBIDDEN'|'NOT_FOUND'|'CONFLICT'|'DATABASE_ERROR'|'EXPORT_LIMIT', message:string, backend_code?:string|null, fields?:ValidationIssue[]}} DataFeatureError */

// Integration signatures (implementations belong in the modules documented below):
/** @typedef {(file:File, context:ImportValidationContext) => Promise<ImportValidationResult>} ValidateStudentFile */
/** @typedef {(validation:ImportValidationResult, context:ImportValidationContext, options?:{mode?:'atomic'|'partial'}) => ImportPreviewResult} BuildImportPreview */
/** @typedef {(preview:ImportPreviewResult, options:ImportCommitOptions) => Promise<ImportCommitResult>} CommitStudentImport */
/** @typedef {(filters:PlacementAnalyticsFilters) => Promise<PlacementAnalyticsOutput>} GetPlacementAnalytics */
/** @typedef {(filters:NoDuesAnalyticsFilters) => Promise<NoDuesAnalyticsOutput>} GetNoDuesAnalytics */
/** @typedef {(input:ReportExportInput) => Promise<ReportExportOutput>} ExportReport */
/** @typedef {(input:ReportExportInput) => Promise<ReportResult>} GetReport */
