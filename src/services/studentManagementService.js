import { DataServiceError, toServiceError } from './serviceError.js';

const WRITABLE = new Set(['student_number','full_name','email','department_id','graduation_year','cgpa','phone','backlogs','program','academic_year','section','placement_registered','eligibility_status','user_id']);
const columns = '*, department:departments(id, code, name)';
function studentPayload(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new DataServiceError('INVALID_INPUT', 'Expected a student object.');
  const result = {};
  for (const [key, value] of Object.entries(input)) {
    if (WRITABLE.has(key)) result[key] = value;
    else if (!['id','created_at','updated_at','department','departments'].includes(key)) throw new DataServiceError('INVALID_INPUT', `Unsupported student field: ${key}.`);
  }
  if (!Object.keys(result).length) throw new DataServiceError('INVALID_INPUT', 'No student fields supplied.');
  return result;
}

export function createStudentManagementService(getClient) {
  async function run(query, fallback) {
    const { data, error } = await query;
    if (error) throw toServiceError(error, fallback);
    return data;
  }
  async function searchStudents(filters = {}) {
    const registered = filters.registered;
    if (![undefined,null,'','true','false',true,false].includes(registered)) throw new DataServiceError('INVALID_INPUT', 'Registration filter must be true or false.');
    const batch = filters.batch ?? filters.graduation_year;
    if (batch !== undefined && batch !== null && batch !== '' && !/^\d{4}$/.test(String(batch))) throw new DataServiceError('INVALID_INPUT', 'Batch must be a four-digit year.');
    return run(getClient().rpc('search_students', {
      p_query: String(filters.q ?? '').trim(), p_department_id: filters.department_id || null,
      p_graduation_year: batch === undefined || batch === null || batch === '' ? null : Number(batch),
      p_registered: registered === undefined || registered === null || registered === '' ? null : registered === true || registered === 'true',
      p_eligibility: filters.eligibility || null, p_offset: filters.offset ?? 0, p_limit: filters.limit ?? 500,
    }), 'Could not load the student directory.');
  }
  async function listStudents(filters = {}) { return (await searchStudents(filters)).students; }
  async function createStudent(input) { return run(getClient().from('students').insert(studentPayload(input)).select(columns).single(), 'Could not create the student.'); }
  async function updateStudent(id, input) { return run(getClient().from('students').update(studentPayload(input)).eq('id', id).select(columns).single(), 'Could not update the student.'); }
  async function getStudentById(id) { return run(getClient().from('students').select(columns).eq('id', id).single(), 'Could not load the student.'); }
  async function deleteStudent(id) {
    // RETURNING detects denied/not-found rows instead of claiming a deletion.
    return run(getClient().from('students').delete().eq('id', id).select('id').single(), 'Could not delete the student.');
  }
  async function listDepartments() { return (await run(getClient().from('departments').select('id, code, name').order('code'), 'Could not load departments.')) ?? []; }
  function departmentPayload(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((key) => !['code','name'].includes(key))) throw new DataServiceError('INVALID_INPUT', 'Only department code and name can be changed.');
    return input;
  }
  async function createDepartment(input) { return run(getClient().from('departments').insert(departmentPayload(input)).select('id, code, name').single(), 'Could not create the department.'); }
  async function updateDepartment(id, input) { return run(getClient().from('departments').update(departmentPayload(input)).eq('id', id).select('id, code, name').single(), 'Could not update the department.'); }
  async function deleteDepartment(id) { return run(getClient().from('departments').delete().eq('id', id).select('id').single(), 'Could not delete the department.'); }
  async function fetchImportContext() { return run(getClient().rpc('get_student_import_context'), 'Could not load import validation data.'); }
  async function findExistingStudentNumbers(numbers) {
    if (!Array.isArray(numbers) || numbers.length > 1000 || numbers.some((value) => typeof value !== 'string')) throw new DataServiceError('INVALID_INPUT', 'Supply at most 1000 text roll numbers.');
    if (!numbers.length) return [];
    return run(getClient().from('students').select('id, student_number, email').in('student_number', [...new Set(numbers.map((value) => value.trim()))]), 'Could not check existing roll numbers.');
  }
  async function commitStudentImport(preview, { confirmed = false, mode = 'atomic' } = {}) {
    if (confirmed !== true) throw new DataServiceError('INVALID_INPUT', 'Confirm the preview before importing.');
    if (!['atomic','partial'].includes(mode) || !Array.isArray(preview?.rows) || !preview.rows.length) throw new DataServiceError('INVALID_INPUT', 'A nonempty import preview and valid mode are required.');
    const result = await run(getClient().rpc('commit_student_import', {
      p_rows: preview.rows.map(({ source_row, student }) => ({ source_row, student })), p_confirmed: true, p_mode: mode,
    }), 'Student import failed. No unreported success is assumed.');
    if (!result || !Array.isArray(result.row_results) || !Array.isArray(result.students)
      || !['total_count','successful_count','skipped_count','failed_count','duplicate_count','inserted_count'].every((key) => Number.isInteger(result[key]) && result[key] >= 0)
      || result.total_count !== preview.rows.length || result.row_results.length !== result.total_count
      || result.students.length !== result.successful_count || result.inserted_count !== result.successful_count
      || result.total_count !== result.successful_count + result.skipped_count + result.failed_count) {
      throw new DataServiceError('DATABASE_ERROR', 'The import response is incomplete. Refresh the directory before retrying.');
    }
    return result;
  }
  async function listImportHistory({ offset = 0, limit = 50 } = {}) {
    if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 1000) throw new DataServiceError('INVALID_INPUT', 'Invalid history pagination.');
    return run(getClient().from('student_import_history').select('*').order('created_at', { ascending: false }).range(offset, offset + limit - 1), 'Could not load import history.');
  }
  const importStudentRows = (rows, options) => commitStudentImport({ rows }, options);
  return { searchStudents, listStudents, createStudent, updateStudent, getStudentById, deleteStudent, listDepartments, createDepartment, updateDepartment, deleteDepartment, fetchImportContext, findExistingStudentNumbers, commitStudentImport, importStudentRows, listImportHistory };
}
