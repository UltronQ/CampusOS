import { getSupabase } from '../lib/supabaseClient';

/**
 * No-dues clearance helpers (Member 1, M1-4).
 *
 * These read stored records only. Per the contract, overall status is NEVER a
 * client-side guess: a student is "cleared" only when every active mandatory
 * item for their department is explicitly cleared or not_applicable WITH
 * in-charge approval evidence. No mandatory items -> "not_configured"
 * (never Cleared). Missing rows block clearance, separately from pending.
 *
 * Approval writes go through Member 2's clearanceService so the
 * approved_by/approved_at evidence rules stay in one place.
 */

/**
 * One authorized read of everything the in-charge no-dues screens need.
 * Returns { items, studentClearances, students }.
 */
export async function fetchClearanceWorkspace() {
  const supabase = getSupabase();
  const [items, clearances, students] = await Promise.all([
    supabase
      .from('clearance_items')
      .select('*, departments(code, name)')
      .order('created_at'),
    supabase
      .from('student_clearances')
      .select('*, clearance_items(id, name, is_mandatory, is_active, department_id)')
      .order('created_at'),
    supabase
      .from('students')
      .select('id, student_number, full_name, graduation_year, department_id, departments(code, name)')
      .order('student_number'),
  ]);
  if (items.error) throw humanError(items.error, 'Could not load clearance items.');
  if (clearances.error) throw humanError(clearances.error, 'Could not load clearances.');
  if (students.error) throw humanError(students.error, 'Could not load students.');
  return {
    items: items.data ?? [],
    studentClearances: clearances.data ?? [],
    students: students.data ?? [],
  };
}

/**
 * Compute one student's overall status from the full applicable mandatory set.
 * Mirrors docs/data-contracts.md.
 * @returns {{overall:'cleared'|'pending'|'not_configured', mandatoryTotal:number, cleared:number, notApplicable:number, pending:number, missing:number}}
 */
export function computeOverallStatus(studentId, items, studentClearances) {
  const mandatory = items.filter((item) => item.is_active && item.is_mandatory);
  if (mandatory.length === 0) {
    return { overall: 'not_configured', mandatoryTotal: 0, cleared: 0, notApplicable: 0, pending: 0, missing: 0 };
  }
  const byItem = new Map(
    studentClearances
      .filter((row) => row.student_id === studentId)
      .map((row) => [row.clearance_item_id, row]),
  );
  let cleared = 0;
  let notApplicable = 0;
  let pending = 0;
  let missing = 0;
  for (const item of mandatory) {
    const row = byItem.get(item.id);
    if (!row) {
      missing += 1;
    } else if (row.status === 'cleared' && row.approved_by && row.approved_at) {
      cleared += 1;
    } else if (row.status === 'not_applicable' && row.approved_by && row.approved_at) {
      notApplicable += 1;
    } else {
      pending += 1;
    }
  }
  return {
    overall: cleared + notApplicable === mandatory.length ? 'cleared' : 'pending',
    mandatoryTotal: mandatory.length,
    cleared,
    notApplicable,
    pending,
    missing,
  };
}

/** Items the student still needs: active mandatory items with no decision row. */
export function pendingRequirements(studentId, items, studentClearances) {
  const mandatory = items.filter((item) => item.is_active && item.is_mandatory);
  const decided = new Set(
    studentClearances
      .filter((row) => row.student_id === studentId)
      .map((row) => row.clearance_item_id),
  );
  return mandatory.filter((item) => !decided.has(item.id));
}

/**
 * The signed-in student's own decisions plus their department's checklist.
 * RLS scopes both reads — no student_id is supplied by the browser.
 * @param {string} studentRowId students.id of the signed-in student
 */
export async function getStudentOwnClearances(studentRowId) {
  const supabase = getSupabase();
  const [clearances, student] = await Promise.all([
    supabase
      .from('student_clearances')
      .select('*, clearance_items(id, name, is_mandatory, is_active, department_id)')
      .order('created_at'),
    supabase.from('students').select('id, department_id').eq('id', studentRowId).maybeSingle(),
  ]);
  if (clearances.error) throw humanError(clearances.error, 'Could not load your clearances.');
  if (student.error) throw humanError(student.error, 'Could not load your department.');

  let items = [];
  if (student.data?.department_id) {
    const template = await supabase
      .from('clearance_items')
      .select('*')
      .eq('department_id', student.data.department_id)
      .order('created_at');
    if (template.error) throw humanError(template.error, 'Could not load your checklist.');
    items = template.data ?? [];
  }
  return { rows: clearances.data ?? [], items };
}

/**
 * Save a remark on one student-item decision (in-charge only, RLS-backed).
 * Creates the decision row as pending if it does not exist yet.
 * @param {string} studentId
 * @param {string} clearanceItemId
 * @param {string} remarks
 */
export async function saveClearanceRemark(studentId, clearanceItemId, remarks) {
  const supabase = getSupabase();
  const { data: existing, error: findError } = await supabase
    .from('student_clearances')
    .select('id')
    .eq('student_id', studentId)
    .eq('clearance_item_id', clearanceItemId)
    .maybeSingle();
  if (findError) throw humanError(findError, 'Could not load the clearance row.');

  if (existing) {
    const { error } = await supabase
      .from('student_clearances')
      .update({ remarks })
      .eq('id', existing.id);
    if (error) throw humanError(error, 'Could not save the remark.');
    return;
  }

  const { error: insertError } = await supabase
    .from('student_clearances')
    .insert({ student_id: studentId, clearance_item_id: clearanceItemId, status: 'pending', remarks });
  if (insertError) throw humanError(insertError, 'Could not save the remark.');
}

function humanError(error, fallback) {
  const code = error?.code ?? '';
  if (code === '42P01' || code === 'PGRST205' || code === '42703') {
    return new Error(
      `The clearance schema is not deployed yet (Member 2 migration pending). ${error?.message ?? ''}`,
    );
  }
  if (code === '42501') {
    return new Error(
      'You are not authorized for this clearance action. Only the Placement In-Charge approves clearances.',
    );
  }
  return new Error(error?.message || fallback || 'The request failed.');
}
