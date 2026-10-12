import { getSupabase } from '../lib/supabaseClient';

/**
 * Departmental no-dues checklist and clearance persistence (Member 2).
 *
 * Rules enforced in the database, not only here:
 *  - Only the placement in-charge may approve (RLS + approved_by/approved_at check).
 *  - A student can never approve their own clearance (RLS blocks student writes).
 *  - A cleared/not_applicable row must carry approver evidence (table CHECK).
 */

/**
 * @param {string} departmentId
 * @returns {Promise<object[]>} Checklist template rows for a department.
 */
export async function listClearanceItemsByDepartment(departmentId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('clearance_items')
    .select('*')
    .eq('department_id', departmentId)
    .order('created_at');
  if (error) throw error;
  return data || [];
}

/**
 * @param {{department_id:string, name:string, is_mandatory?:boolean, is_active?:boolean}} item
 * @returns {Promise<object>}
 */
export async function createClearanceItem(item) {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('clearance_items').insert(item).select().single();
  if (error) throw error;
  return data;
}

/**
 * @param {string} studentId
 * @returns {Promise<object[]>} The student's decisions joined with their items.
 */
export async function getStudentClearances(studentId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('student_clearances')
    .select('*, clearance_items(*)')
    .eq('student_id', studentId)
    .order('created_at');
  if (error) throw error;
  return data || [];
}

/**
 * Approve (or mark not applicable) a single clearance item as the in-charge.
 * @param {string} studentClearanceId
 * @param {string} approverId Profiles row id of the approving in-charge.
 * @param {'cleared'|'not_applicable'} status
 * @returns {Promise<object>}
 */
export async function approveClearance(studentClearanceId, approverId, status) {
  if (status !== 'cleared' && status !== 'not_applicable') {
    throw new Error('Invalid approval status: expected cleared or not_applicable.');
  }
  if (!approverId) {
    throw new Error('Approval requires the approving in-charge profile id.');
  }
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('student_clearances')
    .update({ status, approved_by: approverId, approved_at: new Date().toISOString() })
    .eq('id', studentClearanceId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Revert a decision to pending and clear the approval evidence.
 * @param {string} studentClearanceId
 * @returns {Promise<object>}
 */
export async function markClearancePending(studentClearanceId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('student_clearances')
    .update({ status: 'pending', approved_by: null, approved_at: null })
    .eq('id', studentClearanceId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
