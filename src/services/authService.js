/**
 * Auth service utilities (Member 2)
 * Uses Supabase client; never exposes service role keys.
 */
import { supabase } from '../lib/supabaseClient.js'

export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error) throw error
  return user
}

export async function getCurrentProfile() {
  const user = await getCurrentUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data
}

export async function isPlacementIncharge() {
  const profile = await getCurrentProfile()
  return profile?.role === 'placement_incharge'
}

export async function getStudentRecord() {
  const user = await getCurrentUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('students')
    .select('*')
    .eq('user_id', user.id)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data
}
