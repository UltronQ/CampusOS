import { getSupabase } from '../lib/supabaseClient';

/**
 * Recruitment UI extension service (Member 1, M1-3).
 *
 * Member 2 owns src/services/recruitmentService.js — this module ONLY adds
 * what that service does not yet expose, on the same RLS-protected tables:
 *  - updateDrive (full edit; recruitmentService has updateDriveStatus only)
 *  - detailed drive/application reads with stages, results, offers, students
 *  - drive_eligibility reads/writes (migration 20251012000003)
 * Member 2 may absorb these functions later; pages import them from here.
 * No role or actor is ever sent from the browser — RLS is authoritative.
 */

const STAGE_JOIN =
  'application_stage_results(id, status, published_at, stage_id, recruitment_stages(id, name, sequence))';

function humanError(error, fallback) {
  const code = error?.code ?? '';
  const message = error?.message ?? '';
  if (code === '42703' || code === '42P01' || code === 'PGRST205') {
    return new Error(
      'The database is missing part of the recruitment schema. ' +
        'Apply supabase/migrations/20251012000003_drive_metadata_and_eligibility.sql ' +
        `(Member 2 review required). Details: ${message}`,
    );
  }
  if (code === '42501') {
    return new Error('You are not authorized to perform this action.');
  }
  if (code === '23505') {
    return new Error('That combination already exists — nothing was overwritten.');
  }
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

/** Drives with company, stages and registered-applicant count. */
export async function listDrivesDetailed() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('drives')
    .select('*, companies(*), recruitment_stages(*, sequence), applications(count)')
    .order('start_date', { ascending: false });
  if (error) throw humanError(error, 'Could not load drives.');
  return (data ?? []).map((drive) => ({
    ...drive,
    applicant_count: drive.applications?.[0]?.count ?? 0,
    applications: undefined,
    recruitment_stages: (drive.recruitment_stages ?? []).sort((a, b) => a.sequence - b.sequence),
  }));
}

/** All applications with student, drive/company, offers and stage results. */
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
      `*, drives(id, title, start_date, status, job_location, annual_ctc_minor, currency,
        companies(name), recruitment_stages(id, name, sequence)),
       offers(*), ${STAGE_JOIN}`,
    )
    .eq('student_id', studentId)
    .order('applied_at', { ascending: false });
  if (error) throw humanError(error, 'Could not load your applications.');
  return data ?? [];
}

/** Replace a drive's eligibility rows (delete + insert in sequence). */
export async function replaceDriveEligibility(driveId, entries) {
  const supabase = getSupabase();
  const { error: deleteError } = await supabase
    .from('drive_eligibility')
    .delete()
    .eq('drive_id', driveId);
  if (deleteError) throw humanError(deleteError, 'Could not update eligibility.');
  if (entries.length === 0) return [];
  const { data, error } = await supabase
    .from('drive_eligibility')
    .insert(entries.map((entry) => ({ drive_id: driveId, ...entry })))
    .select('*');
  if (error) throw humanError(error, 'Could not save eligibility.');
  return data ?? [];
}

export async function listDriveEligibility(driveIds) {
  const supabase = getSupabase();
  if (!driveIds || driveIds.length === 0) return [];
  const { data, error } = await supabase
    .from('drive_eligibility')
    .select('*, departments(code)')
    .in('drive_id', driveIds);
  if (error) throw humanError(error, 'Could not load eligibility.');
  return data ?? [];
}

/**
 * Update a drive's ordered stage list: add missing names (sequence appended),
 * never touching stages that already exist (results may reference them).
 */
export async function syncDriveStages(driveId, stageNames, existingStages) {
  const supabase = getSupabase();
  const existingNames = new Set(existingStages.map((stage) => stage.name));
  const missing = stageNames.filter((name) => !existingNames.has(name));
  if (missing.length === 0) return [];
  let sequence =
    existingStages.length > 0 ? Math.max(...existingStages.map((stage) => stage.sequence)) : 0;
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

/** Drive eligibility check for display (UI hint only; server revalidates). */
export function isStudentEligibleForDrive(student, eligibilityRows) {
  const rows = eligibilityRows.filter((row) => row.drive_id === student.driveId);
  if (rows.length === 0) return true; // no targeting configured -> open to all
  return rows.some(
    (row) =>
      row.department_id === student.department_id &&
      (row.graduation_year === null || row.graduation_year === student.graduation_year),
  );
}
