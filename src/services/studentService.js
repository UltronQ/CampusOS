import { getSupabase } from '../lib/supabaseClient';

/**
 * Student persistence service (Member 2).
 * Authorization is enforced by RLS (see supabase/migrations/*_rls_policies.sql):
 * in-charge may manage every student; a student may read only their own row.
 */

/**
 * @returns {Promise<object[]>} Students with their department, ordered by number.
 */
export async function listStudents() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('students')
    .select('*, departments(*)')
    .order('student_number');
  if (error) throw error;
  return data || [];
}

/**
 * @param {object} student snake_case row (student_number, full_name, email, department_id, graduation_year, cgpa, phone)
 * @returns {Promise<object>}
 */
export async function createStudent(student) {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('students').insert(student).select().single();
  if (error) throw error;
  return data;
}

/**
 * @param {string} id
 * @param {object} updates
 * @returns {Promise<object>}
 */
export async function updateStudent(id, updates) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('students')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * @param {string} id
 * @returns {Promise<object>}
 */
export async function getStudentById(id) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('students')
    .select('*, departments(*)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}
