import { supabase } from '../lib/supabaseClient.js'

export async function listCompanies() {
  const { data, error } = await supabase.from('companies').select('*').order('name')
  if (error) throw error
  return data || []
}

export async function createCompany(name) {
  const { data, error } = await supabase.from('companies').insert({ name }).select().single()
  if (error) throw error
  return data
}

export async function listDrives() {
  const { data, error } = await supabase.from('drives').select('*').order('start_date', { ascending: false })
  if (error) throw error
  return data || []
}

export async function createDrive(drive) {
  const { data, error } = await supabase.from('drives').insert(drive).select().single()
  if (error) throw error
  return data
}

export async function updateDriveStatus(id, status) {
  const { data, error } = await supabase.from('drives').update({ status }).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function applyToDrive(studentId, driveId) {
  const { data, error } = await supabase.from('applications').insert({ student_id: studentId, drive_id: driveId }).select().single()
  if (error) throw error
  return data
}

export async function getStudentApplications(studentId) {
  const { data, error } = await supabase
    .from('applications')
    .select('*, drives(*, companies(*)), offers(*)')
    .eq('student_id', studentId)
    .order('applied_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function createOffer(applicationId, offer) {
  const { data, error } = await supabase.from('offers').insert({ application_id: applicationId, ...offer }).select().single()
  if (error) throw error
  return data
}

export async function updateOfferStatus(id, status) {
  const { data, error } = await supabase.from('offers').update({ status }).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function addRecruitmentStage(driveId, name, sequence) {
  const { data, error } = await supabase.from('recruitment_stages').insert({ drive_id: driveId, name, sequence }).select().single()
  if (error) throw error
  return data
}

export async function publishStageResult(applicationId, stageId) {
  const { data, error } = await supabase
    .from('application_stage_results')
    .update({ published_at: new Date().toISOString() })
    .eq('application_id', applicationId)
    .eq('stage_id', stageId)
    .select()
    .single()
  if (error) throw error
  return data
}
