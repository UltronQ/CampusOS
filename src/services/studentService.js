import { supabase } from '../lib/supabaseClient.js'

export async function listStudents() {
  const { data, error } = await supabase.from('students').select('*, departments(*)').order('student_number')
  if (error) throw error
  return data || []
}

export async function createStudent(student) {
  const { data, error } = await supabase.from('students').insert(student).select().single()
  if (error) throw error
  return data
}

export async function updateStudent(id, updates) {
  const { data, error } = await supabase.from('students').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function getStudentById(id) {
  const { data, error } = await supabase.from('students').select('*, departments(*)').eq('id', id).single()
  if (error) throw error
  return data
}
