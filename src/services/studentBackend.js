export function createStudentService(client) {
  async function data(query, fallback = null) {
    const { data: result, error } = await query;
    if (error) throw error;
    return result ?? fallback;
  }
  const fields = ['user_id', 'student_number', 'full_name', 'email', 'department_id', 'graduation_year', 'cgpa', 'phone', 'backlogs'];
  function payload(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || !Object.keys(value).length || Object.keys(value).some(key => !fields.includes(key))) {
      throw new TypeError('Invalid student fields');
    }
    return value;
  }
  return {
    listStudents: () => data(client.from('students').select('*, departments(*)').order('student_number'), []),
    createStudent: student => {
      const record = payload(student);
      return data(client.from('students').insert(record).select().single());
    },
    updateStudent: (id, changes) => {
      const record = payload(changes);
      return data(client.from('students').update(record).eq('id', id).select().single());
    },
    getStudentById: id => data(client.from('students').select('*, departments(*)').eq('id', id).single()),
    commitStudentImport: preview => {
      // The preview and its department IDs are untrusted. PostgreSQL revalidates
      // normalized values and resolves department_code in an atomic transaction.
      if (!preview || preview.mode !== 'insert_only_atomic' || !Array.isArray(preview.rows)
        || preview.validation?.can_commit !== true || preview.blocked_count !== 0
        || preview.insert_count !== preview.rows.length
        || !preview.rows.length || preview.rows.length > 10000
        || preview.rows.some(row => !row || row.action !== 'insert' || !Number.isInteger(row.source_row)
          || row.source_row < 2 || !row.student || typeof row.student !== 'object')) {
        throw new TypeError('Invalid insert-only import preview');
      }
      return data(client.rpc('commit_student_import', { p_rows: preview.rows.map(row => ({ source_row: row.source_row, student: row.student })) }))
        .catch(error => {
          const failure = new Error(error.code === '42501' ? 'Student import access denied.' : 'Could not commit student import.');
          failure.code = error.code === '42501' ? 'FORBIDDEN' : 'DATABASE_ERROR';
          throw failure;
        });
    },
  };
}
