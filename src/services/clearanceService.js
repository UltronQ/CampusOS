import { supabase } from '../lib/supabaseClient.js'

export async function listClearanceItemsByDepartment(departmentId) {
  const { data, error } = await supabase
    .from('clearance_items')
    .select('*')
    .eq('department_id', departmentId)
    .order('created_at')
  if (error) throw error
  return data || []
}

export async function createClearanceItem(item) {
  const { data, error } = await supabase.from('clearance_items').insert(item).select().single()
  if (error) throw error
  return data
}

export async function getStudentClearances(studentId) {
  const { data, error } = await supabase
    .from('student_clearances')
    .select('*, clearance_items(*)')
    .eq('student_id', studentId)
    .order('created_at')
  if (error) throw error
  return data || []
}

export async function approveClearance(studentClearanceId, approverId, status) {
  // Only in-charge may approve; status must be cleared or not_applicable
  if (status !== 'cleared' && status !== 'not_applicable') {
    throw new Error('Invalid approval status')
  }
  const { data, error } = await supabase
    .from('student_clearances')
    .update({ status, approved_by: approverId, approved_at: new Date().toISOString() })
    .eq('id', studentClearanceId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function markClearancePending(studentClearanceId) {
  const { data, error } = await supabase
    .from('student_clearances')
    .update({ status: 'pending', approved_by: null, approved_at: null })
    .eq('id', studentClearanceId)
    .select()
    .single()
  if (error) throw error
  return data
}
