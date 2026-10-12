import { CLEARANCE_STATUSES } from '../features/data/contracts.js';

/** Authenticated Supabase client. All approval evidence is generated in PostgreSQL. */
export function createClearanceService(client) {
  async function data(query, fallback) {
    const { data: result, error } = await query;
    if (error) throw error;
    return result ?? fallback;
  }
  const row = query => data(query.select().single(), null);
  function fields(input, allowed) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Expected an object');
    const unknown = Object.keys(input).filter(key => !allowed.includes(key));
    if (unknown.length) throw new TypeError(`Unsupported fields: ${unknown.join(', ')}`);
    return input;
  }
  function filters(input = {}) {
    fields(input, ['department_ids', 'graduation_years']);
    const { department_ids = [], graduation_years = [] } = input;
    if (!Array.isArray(department_ids) || !department_ids.every(id => typeof id === 'string' && id.length > 0)
      || !Array.isArray(graduation_years) || !graduation_years.every(y => Number.isInteger(y) && y > 1900 && y < 2100)) {
      throw new TypeError('Invalid department or graduation batch filters');
    }
    return { p_department_ids: department_ids, p_graduation_years: graduation_years };
  }
  function setClearanceStatus(id, status, details = {}) {
    if (!CLEARANCE_STATUSES.includes(status)) {
      throw new TypeError('Invalid clearance status');
    }
    fields(details, ['remarks', 'pending_requirements']);
    if ('remarks' in details && details.remarks !== null && typeof details.remarks !== 'string') {
      throw new TypeError('Remarks must be text or null');
    }
    if ('pending_requirements' in details && (!Array.isArray(details.pending_requirements)
      || !details.pending_requirements.every(text => typeof text === 'string' && text.trim().length > 0))) {
      throw new TypeError('Pending requirements must be nonempty text entries');
    }
    const resolved = ['cleared', 'not_applicable'].includes(status);
    if (resolved && details.pending_requirements?.length) throw new TypeError('Resolved items cannot have pending requirements');
    return row(client.from('student_clearances').update({ ...details, status,
      ...(resolved ? { pending_requirements: [] } : {}),
    }).eq('id', id));
  }
  return {
    listClearanceItemsByDepartment: departmentId => data(client.from('clearance_items')
      .select('*').eq('department_id', departmentId).order('name').order('id'), []),
    createClearanceItem: item => row(client.from('clearance_items').insert(fields(item,
      ['department_id', 'name', 'is_mandatory', 'is_active']))),
    updateClearanceItem: (id, changes) => {
      fields(changes, ['name', 'is_mandatory', 'is_active']);
      if (!Object.keys(changes).length) throw new TypeError('Empty category update');
      return row(client.from('clearance_items').update(changes).eq('id', id));
    },
    deleteClearanceItem: id => row(client.from('clearance_items').delete().eq('id', id)),
    initializeStudentClearances: studentId => data(client.rpc('initialize_student_clearances', { p_student_id: studentId }), []),
    getStudentClearances: studentId => data(client.from('student_clearances')
      .select('*, clearance_items(*)').eq('student_id', studentId).order('created_at').order('id'), []),
    setClearanceStatus,
    // Legacy approver argument is never forwarded. The database uses auth.uid().
    approveClearance: (id, _approverId, status, details = {}) => {
      if (!['cleared', 'not_applicable'].includes(status)) throw new TypeError('Invalid approval status');
      return setClearanceStatus(id, status, details);
    },
    markClearancePending: (id, details = {}) => setClearanceStatus(id, 'pending', details),
    getStudentNoDuesStatement: studentId => data(client.rpc('get_student_no_dues_statement', { p_student_id: studentId }), null),
    getNoDuesProgress: input => data(client.rpc('get_no_dues_progress', filters(input)), null),
  };
}
