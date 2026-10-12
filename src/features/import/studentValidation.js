import { DATA_CONTRACT_VERSION, IMPORT_HEADERS } from '../data/contracts.js';

export const OPTIONAL_IMPORT_HEADERS = Object.freeze(['program', 'academic_year', 'section', 'placement_registered', 'eligibility_status']);
export const REQUIRED_IMPORT_HEADERS = Object.freeze(IMPORT_HEADERS.slice(0, 5));
const allowedHeaders = new Set([...IMPORT_HEADERS, ...OPTIONAL_IMPORT_HEADERS]);
const text = (value) => value === undefined || value === null ? '' : String(value).trim();
const issue = (code, field, message) => ({ code, field, message });

export function assertImportContext(context) {
  if (!context || !Array.isArray(context.departments) || !Array.isArray(context.existing_students)
    || !Number.isInteger(context.min_graduation_year) || !Number.isInteger(context.max_graduation_year)
    || context.min_graduation_year > context.max_graduation_year
    || !Number.isInteger(context.max_rows) || context.max_rows < 1 || context.max_rows > 10000) {
    throw Object.assign(new Error('Import context must come from the authorized backend service and contain valid limits.'), { code: 'INVALID_INPUT' });
  }
}

/** Deterministic validation over parsed records and database-backed context. */
export function validateStudentRows(parsed, context) {
  assertImportContext(context);
  const headers = Array.from(parsed.headers, (value) => text(value).replace(/^\uFEFF/, ''));
  const file_errors = [...parsed.file_errors];
  const seenHeaders = new Set();
  headers.forEach((header, index) => {
    if (seenHeaders.has(header)) file_errors.push(issue('DUPLICATE_HEADER', header || null, `Column ${index + 1}: header is duplicated.`));
    seenHeaders.add(header);
    if (!allowedHeaders.has(header)) file_errors.push(issue('UNKNOWN_HEADER', header || null, `Column ${index + 1}: use a supported template column.`));
  });
  for (const header of REQUIRED_IMPORT_HEADERS) {
    if (!seenHeaders.has(header)) file_errors.push(issue('MISSING_HEADER', header, `Required column ${header} is missing.`));
  }
  const departments = new Map();
  for (const department of context.departments) {
    const code = text(department.code).toUpperCase();
    if (departments.has(code)) throw new Error('Backend department codes are ambiguous.');
    departments.set(code, department.id);
  }
  const existingNumbers = new Set(context.existing_students.map((student) => text(student.student_number)));
  const existingEmails = new Set(context.existing_students.map((student) => text(student.email).toLowerCase()));
  const rows = parsed.rows.map((record) => {
    const raw = Object.fromEntries(headers.map((header, index) => [header, record.cells[index] ?? '']));
    const errors = [];
    const warnings = [];
    const normalized = {
      student_number: text(raw.student_number), full_name: text(raw.full_name), email: text(raw.email).toLowerCase(),
      department_code: text(raw.department_code).toUpperCase(), graduation_year: null, cgpa: null, phone: text(raw.phone) || null, backlogs: null,
    };
    for (const error of record.cell_errors) errors.push(issue(error.code, headers[error.column] ?? null, error.message));
    if ((parsed.format === 'csv' && record.cells.length !== headers.length)
      || record.cells.slice(headers.length).some((value) => text(value) !== '')) {
      errors.push(issue('COLUMN_COUNT', null, `Expected ${headers.length} columns. Check commas and quoting.`));
    }
    for (const field of REQUIRED_IMPORT_HEADERS) {
      if (!text(raw[field])) errors.push(issue('REQUIRED', field, `${field} is required.`));
    }
    for (const [field, value] of Object.entries(raw)) {
      if (typeof value === 'string' && value.trimStart().startsWith('=')) errors.push(issue('FORMULA_CELL', field, 'Formula text is not permitted. Supply a literal value.'));
    }
    for (const field of ['student_number', 'phone']) {
      if (text(raw[field]) && typeof raw[field] !== 'string') errors.push(issue('IDENTIFIER_NOT_TEXT', field, 'Format identifiers as text to preserve leading zeroes.'));
    }
    if (normalized.student_number.length > 64) errors.push(issue('INVALID_STUDENT_NUMBER', 'student_number', 'Roll number must be at most 64 characters.'));
    if (normalized.full_name.length > 200) errors.push(issue('INVALID_NAME', 'full_name', 'Name must be at most 200 characters.'));
    if (text(raw.full_name) && typeof raw.full_name !== 'string') errors.push(issue('INVALID_NAME', 'full_name', 'Name must be text.'));
    if (normalized.email && (typeof raw.email !== 'string' || normalized.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/.test(normalized.email))) {
      errors.push(issue('INVALID_EMAIL', 'email', 'Enter a valid email address.'));
    }
    if (normalized.department_code && !departments.has(normalized.department_code)) errors.push(issue('UNKNOWN_DEPARTMENT', 'department_code', 'Department code does not exist in the database.'));
    if (text(raw.department_code) && typeof raw.department_code !== 'string') errors.push(issue('INVALID_DEPARTMENT_CODE', 'department_code', 'Department code must be text.'));
    const year = text(raw.graduation_year);
    if (!/^\d{4}$/.test(year) || Number(year) < context.min_graduation_year || Number(year) > context.max_graduation_year) {
      errors.push(issue('INVALID_YEAR', 'graduation_year', `Use a whole year from ${context.min_graduation_year} to ${context.max_graduation_year}.`));
    } else normalized.graduation_year = Number(year);
    const cgpa = text(raw.cgpa);
    if (cgpa) {
      if (!/^\d+(\.\d{1,2})?$/.test(cgpa) || !Number.isFinite(Number(cgpa)) || Number(cgpa) > 10) errors.push(issue('INVALID_CGPA', 'cgpa', 'CGPA must be 0–10 with at most two decimal places.'));
      else normalized.cgpa = Number(cgpa);
    }
    const backlogs = text(raw.backlogs);
    if (backlogs) {
      if (!/^\d{1,9}$/.test(backlogs)) errors.push(issue('INVALID_BACKLOGS', 'backlogs', 'Backlogs must be a nonnegative integer of at most nine digits.'));
      else normalized.backlogs = Number(backlogs);
    }
    if (normalized.phone && (!/^\+?[0-9 ()-]+$/.test(normalized.phone) || normalized.phone.replace(/\D/g, '').length < 7 || normalized.phone.replace(/\D/g, '').length > 15)) {
      errors.push(issue('INVALID_PHONE', 'phone', 'Phone must contain 7–15 digits with permitted punctuation.'));
    }
    for (const [field, limit] of [['program', 100], ['section', 30]]) {
      if (headers.includes(field)) {
        normalized[field] = text(raw[field]) || null;
        if ((text(raw[field]) && typeof raw[field] !== 'string') || text(raw[field]).length > limit) errors.push(issue('INVALID_TEXT', field, `Use text of at most ${limit} characters.`));
      }
    }
    if (headers.includes('academic_year')) {
      const academicYear = text(raw.academic_year);
      normalized.academic_year = academicYear ? Number(academicYear) : null;
      if (academicYear && (!/^[1-8]$/.test(academicYear))) errors.push(issue('INVALID_ACADEMIC_YEAR', 'academic_year', 'Academic year must be 1–8 or blank.'));
    }
    if (headers.includes('placement_registered')) {
      const registered = text(raw.placement_registered).toLowerCase();
      normalized.placement_registered = registered === 'true';
      if (registered && !['true','false'].includes(registered)) errors.push(issue('INVALID_REGISTRATION', 'placement_registered', 'Use true, false or blank (false).'));
    }
    if (headers.includes('eligibility_status')) {
      normalized.eligibility_status = text(raw.eligibility_status).toLowerCase() || 'pending';
      if (!['pending','eligible','ineligible'].includes(normalized.eligibility_status)) errors.push(issue('INVALID_ELIGIBILITY', 'eligibility_status', 'Use pending, eligible or ineligible.'));
    }
    if (existingNumbers.has(normalized.student_number)) errors.push(issue('EXISTING_STUDENT_NUMBER', 'student_number', 'Roll number already exists. It will never be overwritten.'));
    if (existingEmails.has(normalized.email)) errors.push(issue('EXISTING_EMAIL', 'email', 'Email already exists. It will never be overwritten.'));
    return { source_row: record.source_row, raw, normalized, errors, warnings };
  });
  // Mark all duplicate members: no arbitrary first row wins.
  for (const [field, code] of [['student_number','DUPLICATE_STUDENT_NUMBER'], ['email','DUPLICATE_EMAIL']]) {
    const groups = new Map();
    for (const row of rows) {
      const key = row.normalized[field];
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    for (const group of groups.values()) if (group.length > 1) {
      for (const row of group) row.errors.push(issue(code, field, `Repeated in file rows ${group.map((member) => member.source_row).join(', ')}.`));
    }
  }
  const valid_rows = rows.filter((row) => !row.errors.length).length;
  return { contract_version: DATA_CONTRACT_VERSION, rows, file_errors,
    total_rows: rows.length, valid_rows, invalid_rows: rows.length - valid_rows,
    warning_rows: rows.filter((row) => row.warnings.length).length,
    duplicate_rows: rows.filter((row) => row.errors.some((error) => /^(DUPLICATE|EXISTING)_/.test(error.code))).length,
    can_commit: rows.length > 0 && valid_rows === rows.length && !file_errors.length,
    can_commit_partial: valid_rows > 0 && !file_errors.length,
    sheet_name: parsed.sheet_name, filename: parsed.filename, truncated: parsed.truncated,
  };
}
