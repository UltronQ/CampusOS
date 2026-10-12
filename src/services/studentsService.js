import { getSupabase } from '../lib/supabaseClient';
import { IMPORT_CONFIG, DIRECTORY_ROW_LIMIT } from '../app/config';

/**
 * Students & departments persistence boundary (Member 1 frontend layer).
 *
 * Integration contract with Member 2:
 *  - Tables (per docs/data-contracts.md plus M1-2 extended fields):
 *      departments(id, code unique, name)
 *      students(id, user_id, student_number unique, full_name, email unique,
 *               department_id FK, program, academic_year, section,
 *               graduation_year, placement_registered boolean,
 *               eligibility_status text check in
 *               ('pending','eligible','ineligible'),
 *               cgpa nullable, phone nullable)
 *  - RLS enforces authorization: only placement_incharge rows may write;
 *    students read only their own row. This service never sends a role.
 *  - commitStudentImport calls RPC commit_student_import(p_rows jsonb) which
 *    must revalidate EVERY value, department reference and uniqueness inside
 *    one trusted SECURITY DEFINER transaction (insert-only, atomic).
 *    It returns { committed, inserted_count, students, errors }.
 *  - If Member 2 ships different names, only this file changes; pages and
 *    hooks keep the shapes below.
 *
 * Errors: every failure throws an Error with a human-readable message
 * (schema-pending, permission, conflict, or the raw database message).
 * Nothing is swallowed and no write ever reports success optimistically.
 */

/**
 * Columns the DEPLOYED schema actually has (migrations 0001 + phase-one
 * alignment). Program/year/section/registration/eligibility from the M1-2
 * brief are not in the schema yet — see docs/m1-5-integration-quality.md.
 */
const STUDENT_COLUMNS =
  'id, user_id, student_number, full_name, email, department_id, ' +
  'graduation_year, cgpa, phone, backlogs, department:departments(id, code, name)';

/** Map database error codes to honest, human-readable messages. */
export function toHumanError(error) {
  const code = error?.code ?? '';
  const message = error?.message ?? '';
  if (code === '42P01' || code === 'PGRST205' || code === '42703') {
    return new Error(
      'The campus database schema is not deployed yet (Member 2 migration pending). ' +
        `Details: ${message}`,
    );
  }
  if (code === '401' || code === '403' || code === '42501') {
    return new Error(
      'You are not authorized to perform this action. Sign in as the Placement In-Charge.',
    );
  }
  if (code === '23505') {
    return new Error(
      'A student with this roll number or university email already exists. ' +
        'No record was overwritten — edit the existing student instead.',
    );
  }
  if (code === '23503') {
    return new Error(
      'This student cannot be deleted because placement records reference them. ' +
        'Remove or resolve the linked records first.',
    );
  }
  return new Error(message || 'The request failed.');
}

/** Strip characters that would break PostgREST or() filter syntax. */
function sanitizeSearch(term) {
  return String(term).replace(/[,()%]/g, ' ').trim();
}

/**
 * List students with directory filters. Empty filter values mean no constraint.
 * Registration/eligibility filters were removed in M1-5: those columns do not
 * exist in the deployed schema and a filter on them fails the whole query.
 * @param {{q?:string, department_id?:string, batch?:string|number}} filters
 * @returns {Promise<Array<Record<string, any>>>}
 */
export async function listStudents(filters = {}) {
  const supabase = getSupabase();
  const { q = '', department_id = '', batch = '' } = filters;
  let query = supabase
    .from('students')
    .select(STUDENT_COLUMNS)
    .order('student_number', { ascending: true })
    .limit(DIRECTORY_ROW_LIMIT);

  const term = sanitizeSearch(q);
  if (term) {
    query = query.or(
      `student_number.ilike.%${term}%,full_name.ilike.%${term}%,email.ilike.%${term}%`,
    );
  }
  if (department_id) query = query.eq('department_id', department_id);
  if (batch !== '' && batch !== null && batch !== undefined) {
    query = query.eq('graduation_year', Number(batch));
  }

  const { data, error } = await query;
  if (error) throw toHumanError(error);
  return data ?? [];
}

/**
 * Create one student. Conflicts raise 23505 — never an upsert.
 * @param {Record<string, any>} student
 */
export async function createStudent(student) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('students')
    .insert(toStudentRow(student))
    .select(STUDENT_COLUMNS)
    .single();
  if (error) throw toHumanError(error);
  return data;
}

/**
 * Update one student by ID (no upsert, no cross-row effects).
 * @param {string} id
 * @param {Record<string, any>} student
 */
export async function updateStudent(id, student) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('students')
    .update(toStudentRow(student))
    .eq('id', id)
    .select(STUDENT_COLUMNS)
    .single();
  if (error) throw toHumanError(error);
  return data;
}

/**
 * Delete one student by ID. Linked placement records block deletion (FK).
 * @param {string} id
 */
export async function deleteStudent(id) {
  const supabase = getSupabase();
  const { error } = await supabase.from('students').delete().eq('id', id);
  if (error) throw toHumanError(error);
}

/** Strip the embedded join; only scalar columns are writable. */
function toStudentRow(student) {
  const { department, ...rest } = student;
  return rest;
}

/** @returns {Promise<Array<{id:string, code:string, name:string}>>} */
export async function listDepartments() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('departments')
    .select('id, code, name')
    .order('code', { ascending: true });
  if (error) throw toHumanError(error);
  return data ?? [];
}

export async function createDepartment({ code, name }) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('departments')
    .insert({ code: code.trim().toUpperCase(), name: name.trim() })
    .select('id, code, name')
    .single();
  if (error) throw toHumanError(error);
  return data;
}

export async function deleteDepartment(id) {
  const supabase = getSupabase();
  const { error } = await supabase.from('departments').delete().eq('id', id);
  if (error) throw toHumanError(error);
}

/**
 * Build the Member 3 import validation context from authorized DB records.
 * @returns {Promise<import('../features/data/contracts').ImportValidationContext>}
 */
export async function fetchImportContext() {
  const supabase = getSupabase();
  const [departments, existingError] = await Promise.all([
    supabase.from('departments').select('id, code'),
    supabase.from('students').select('id, student_number, email').limit(10000),
  ]);
  if (departments.error) throw toHumanError(departments.error);
  if (existingError.error) throw toHumanError(existingError.error);
  return {
    departments: (departments.data ?? []).map((d) => ({ id: d.id, code: d.code })),
    existing_students: existingError.data ?? [],
    min_graduation_year: IMPORT_CONFIG.min_graduation_year,
    max_graduation_year: IMPORT_CONFIG.max_graduation_year,
    max_rows: IMPORT_CONFIG.max_rows,
  };
}

/**
 * Commit a validated import preview through Member 2's trusted RPC.
 * Revalidation happens server-side; the client preview is untrusted.
 * Atomic: success inserts all rows, failure inserts zero.
 * @param {import('../features/data/contracts').ImportPreviewResult} preview
 * @returns {Promise<import('../features/data/contracts').ImportCommitResult>}
 */
export async function commitStudentImport(preview) {
  const supabase = getSupabase();
  const rows = (preview?.rows ?? []).map((row) => ({
    source_row: row.source_row,
    student: row.student,
  }));
  const { data, error } = await supabase.rpc('commit_student_import', { p_rows: rows });
  if (error) throw toHumanError(error);
  return {
    committed: Boolean(data?.committed),
    inserted_count: Number(data?.inserted_count ?? 0),
    students: data?.students ?? [],
    errors: data?.errors ?? [],
  };
}
