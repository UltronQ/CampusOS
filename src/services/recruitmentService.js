import { getSupabase } from '../lib/supabaseClient';
import { createRecruitmentService } from './recruitmentBackend.js';

export const listCompanies = (...args) => createRecruitmentService(getSupabase()).listCompanies(...args);
export const createCompany = (...args) => createRecruitmentService(getSupabase()).createCompany(...args);
export const updateCompany = (...args) => createRecruitmentService(getSupabase()).updateCompany(...args);
export const deleteCompany = (...args) => createRecruitmentService(getSupabase()).deleteCompany(...args);
export const listDrives = (...args) => createRecruitmentService(getSupabase()).listDrives(...args);
export const createDrive = (...args) => createRecruitmentService(getSupabase()).createDrive(...args);
export const updateDrive = (...args) => createRecruitmentService(getSupabase()).updateDrive(...args);
export const updateDriveStatus = (...args) => createRecruitmentService(getSupabase()).updateDriveStatus(...args);
export const deleteDrive = (...args) => createRecruitmentService(getSupabase()).deleteDrive(...args);
export const getStudentDrives = (...args) => createRecruitmentService(getSupabase()).getStudentDrives(...args);
export const applyToDrive = (...args) => createRecruitmentService(getSupabase()).applyToDrive(...args);
export const getStudentApplications = (...args) => createRecruitmentService(getSupabase()).getStudentApplications(...args);
export const listDriveApplications = (...args) => createRecruitmentService(getSupabase()).listDriveApplications(...args);
export const updateApplicationStatus = (...args) => createRecruitmentService(getSupabase()).updateApplicationStatus(...args);
export const withdrawApplication = (...args) => createRecruitmentService(getSupabase()).withdrawApplication(...args);
export const deleteApplication = (...args) => createRecruitmentService(getSupabase()).deleteApplication(...args);
export const createOffer = (...args) => createRecruitmentService(getSupabase()).createOffer(...args);
export const listApplicationOffers = (...args) => createRecruitmentService(getSupabase()).listApplicationOffers(...args);
export const updateOffer = (...args) => createRecruitmentService(getSupabase()).updateOffer(...args);
export const updateOfferStatus = (...args) => createRecruitmentService(getSupabase()).updateOfferStatus(...args);
export const deleteOffer = (...args) => createRecruitmentService(getSupabase()).deleteOffer(...args);
export const getRecruitmentSuccessCounts = (...args) => createRecruitmentService(getSupabase()).getRecruitmentSuccessCounts(...args);

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
