import { getSupabase } from '../lib/supabaseClient';

/**
 * Recruitment UI extension service (Member 1, M1-3/M1-4).
 *
 * Member 2 owns src/services/recruitmentService.js — this module ONLY adds
 * what that service does not expose, on the same RLS-protected tables:
 *  - updateDrive (full edit; recruitmentService has updateDriveStatus only)
 *  - detailed drive/application reads with companies, stages, offers, students
 *  - drive eligibility writes using the phase-one schema:
 *      drives.eligible_graduation_years (integer[]; empty = all years)
 *      drive_departments (join rows; none = all departments)
 * No role or actor is sent from the browser — RLS is authoritative.
 */

const STAGE_JOIN =
  'application_stage_results(id, status, published_at, stage_id, recruitment_stages(id, name, sequence))';

function humanError(error, fallback) {
  const code = error?.code ?? '';
  const message = error?.message ?? '';
  if (code === '42703' || code === '42P01' || code === 'PGRST205') {
    return new Error(
      `The database is missing part of the recruitment schema — apply the phase-one migration. Details: ${message}`,
    );
  }
  if (code === '42501') return new Error('You are not authorized to perform this action.');
  if (code === '23505') return new Error('That combination already exists — nothing was overwritten.');
  return new Error(message || fallback || 'The request failed.');
}

/** Full drive edit (Member 2's service only updates status). */
export async function updateDrive(id, updates) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('drives')
    .update(updates)
    .eq('id', id)
    .select('*, companies(*)')
    .single();
  if (error) throw humanError(error, 'Could not save the drive.');
  return data;
}

/** Drives with company, departments, ordered stages and applicant count. */
export async function listDrivesDetailed() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('drives')
    .select(
      '*, companies(*), drive_departments(department_id, departments(code)), recruitment_stages(*, sequence), applications(count)',
    )
    .order('start_date', { ascending: false });
  if (error) throw humanError(error, 'Could not load drives.');
  return (data ?? []).map((drive) => ({
    ...drive,
    applicant_count: drive.applications?.[0]?.count ?? 0,
    applications: undefined,
    drive_departments: drive.drive_departments ?? [],
    recruitment_stages: (drive.recruitment_stages ?? []).sort((a, b) => a.sequence - b.sequence),
  }));
}

/** All applications with student, drive/company, offers and published-visible stages. */
export async function listApplicationsDetailed({ driveId } = {}) {
  const supabase = getSupabase();
  let query = supabase
    .from('applications')
    .select(
      `*, students(id, student_number, full_name, email, graduation_year, departments(code, name)),
       drives(id, title, status, companies(name)), offers(*), ${STAGE_JOIN}`,
    )
    .order('applied_at', { ascending: false });
  if (driveId) query = query.eq('drive_id', driveId);
  const { data, error } = await query;
  if (error) throw humanError(error, 'Could not load applications.');
  return data ?? [];
}

/**
 * A student's own applications with drive stages and published results.
 * RLS strips unpublished results and other students' rows server-side.
 */
export async function getStudentApplicationsDetailed(studentId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('applications')
    .select(
      `*, drives(id, title, start_date, status, companies(name), recruitment_stages(id, name, sequence)),
       offers(*), ${STAGE_JOIN}`,
    )
    .eq('student_id', studentId)
    .order('applied_at', { ascending: false });
  if (error) throw humanError(error, 'Could not load your applications.');
  return data ?? [];
}

/**
 * Save a drive's eligibility targeting in one shot: the graduation-year array
 * on the drives row plus the department join rows (replace-set semantics).
 */
export async function saveDriveEligibility(driveId, { departmentIds, graduationYears }) {
  const supabase = getSupabase();
  const { error: updateError } = await supabase
    .from('drives')
    .update({ eligible_graduation_years: graduationYears ?? [] })
    .eq('id', driveId);
  if (updateError) throw humanError(updateError, 'Could not save eligible batches.');

  const { error: deleteError } = await supabase
    .from('drive_departments')
    .delete()
    .eq('drive_id', driveId);
  if (deleteError) throw humanError(deleteError, 'Could not save eligible departments.');

  if (!departmentIds || departmentIds.length === 0) return [];
  const { data, error } = await supabase
    .from('drive_departments')
    .insert(departmentIds.map((departmentId) => ({ drive_id: driveId, department_id: departmentId })))
    .select('*');
  if (error) throw humanError(error, 'Could not save eligible departments.');
  return data ?? [];
}

/**
 * Append missing stage names to a drive (never rewrites existing stages so
 * published results that reference them stay intact).
 */
export async function syncDriveStages(driveId, stageNames, existingStages) {
  const supabase = getSupabase();
  const existingNames = new Set(existingStages.map((stage) => stage.name));
  const missing = stageNames.filter((name) => !existingNames.has(name));
  if (missing.length === 0) return [];
  let sequence = existingStages.length > 0 ? Math.max(...existingStages.map((s) => s.sequence)) : 0;
  const created = [];
  for (const name of missing) {
    sequence += 1;
    const { data, error } = await supabase
      .from('recruitment_stages')
      .insert({ drive_id: driveId, name, sequence })
      .select('*')
      .single();
    if (error) throw humanError(error, `Could not add stage "${name}".`);
    created.push(data);
  }
  return created;
}

/** Set application status by ID (in-charge action; RLS-backed). */
export async function setApplicationStatus(applicationId, status) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('applications')
    .update({ status })
    .eq('id', applicationId)
    .select('id, status')
    .single();
  if (error) throw humanError(error, 'Could not update the application.');
  return data;
}
