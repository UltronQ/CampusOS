import { getSupabase } from '../lib/supabaseClient';

/**
 * Company, drive, application, stage and offer persistence (Member 2).
 * Authorization is enforced by RLS: in-charge manages these tables; a student
 * reads only their own applications/offers and published stage results.
 * Multiple offers per student are allowed by design (no unique student constraint).
 */

/** @returns {Promise<object[]>} */
export async function listCompanies() {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('companies').select('*').order('name');
  if (error) throw error;
  return data || [];
}

/**
 * @param {string} name
 * @returns {Promise<object>}
 */
export async function createCompany(name) {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('companies').insert({ name }).select().single();
  if (error) throw error;
  return data;
}

/** @returns {Promise<object[]>} */
export async function listDrives() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('drives')
    .select('*, companies(*)')
    .order('start_date', { ascending: false });
  if (error) throw error;
  return data || [];
}

/**
 * @param {{company_id:string, title:string, start_date:string, status?:string}} drive
 * @returns {Promise<object>}
 */
export async function createDrive(drive) {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('drives').insert(drive).select().single();
  if (error) throw error;
  return data;
}

/**
 * @param {string} id
 * @param {import('../features/data/contracts.js').DriveStatus} status
 * @returns {Promise<object>}
 */
export async function updateDriveStatus(id, status) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('drives')
    .update({ status })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * @param {string} studentId
 * @param {string} driveId
 * @returns {Promise<object>}
 */
export async function applyToDrive(studentId, driveId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('applications')
    .insert({ student_id: studentId, drive_id: driveId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * @param {string} studentId
 * @returns {Promise<object[]>} Applications with drive/company and offers.
 */
export async function getStudentApplications(studentId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('applications')
    .select('*, drives(*, companies(*)), offers(*)')
    .eq('student_id', studentId)
    .order('applied_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

/**
 * @param {string} applicationId
 * @param {{status?:string, annual_ctc_minor?:number|null, currency?:string}} offer
 * @returns {Promise<object>}
 */
export async function createOffer(applicationId, offer) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('offers')
    .insert({ application_id: applicationId, ...offer })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * @param {string} id
 * @param {string} status
 * @returns {Promise<object>}
 */
export async function updateOfferStatus(id, status) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('offers')
    .update({ status })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * @param {string} driveId
 * @param {string} name
 * @param {number} sequence Unique within the drive.
 * @returns {Promise<object>}
 */
export async function addRecruitmentStage(driveId, name, sequence) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('recruitment_stages')
    .insert({ drive_id: driveId, name, sequence })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Publish a stage result so the student can see it. Results stay invisible to
 * the student until published_at is set (enforced by RLS, not by the UI).
 * @param {string} applicationId
 * @param {string} stageId
 * @param {string} status pending | passed | failed
 * @returns {Promise<object>}
 */
export async function publishStageResult(applicationId, stageId, status) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('application_stage_results')
    .upsert(
      {
        application_id: applicationId,
        stage_id: stageId,
        ...(status ? { status } : {}),
        published_at: new Date().toISOString(),
      },
      { onConflict: 'application_id,stage_id' },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}
