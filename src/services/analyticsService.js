import { getSupabase } from '../lib/supabaseClient';

/**
 * Analytics boundary for the dashboards (Member 1, M1-4).
 *
 * Per the shared prompt, dashboard totals MUST come from Member 3's analytics
 * services when available — never from naively counting application rows.
 * Placement analytics now delegates directly to Member 3's implemented engine.
 * No-dues retains its existing authorized snapshot until its assigned phase.
 * No-dues discovers its assigned module through import.meta.glob; until then
 * its existing calculations use authorized database records and mandatory-item
 * semantics. Placement errors always propagate, without a snapshot fallback.
 *
 * Money is integer minor units; rates are half-up to 2dp.
 */

const analyticsModules = import.meta.glob('../features/analytics/*.js');

async function loadModule(name) {
  const path = `../features/analytics/${name}.js`;
  const loader = analyticsModules[path];
  if (!loader) return null;
  try {
    return await loader();
  } catch {
    return null;
  }
}

/** Report which source powered a section so the UI can label it honestly. */
export async function getAnalyticsSource() {
  const placement = await loadModule('placementAnalytics');
  const noDues = await loadModule('noDuesAnalytics');
  return {
    placement: placement?.getPlacementAnalytics ? 'member3' : 'snapshot',
    noDues: noDues?.getNoDuesAnalytics ? 'member3' : 'snapshot',
  };
}

function roundHalfUp(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function rate(numerator, denominator) {
  return {
    numerator,
    denominator,
    percent: denominator ? roundHalfUp((100 * numerator) / denominator) : null,
  };
}


function hasAny(filters) {
  return Object.values(filters ?? {}).some((value) =>
    Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined && value !== '',
  );
}

/**
 * Placement analytics delegates to Member 3; failures propagate without fallback.
 * @returns {Promise<{source:'member3'|'snapshot', data: import('../features/data/contracts').PlacementAnalyticsOutput}>}
 */
export async function getPlacementAnalytics(filters = {}) {
  const module = await import('../features/analytics/placementAnalytics.js');
  return { source: 'member3', data: await module.getPlacementAnalytics(filters) };
}

/**
 * No-dues analytics. Delegates to Member 3 when present; otherwise a snapshot
 * using the contract's mandatory-item semantics.
 * @returns {Promise<{source:'member3'|'snapshot', data: import('../features/data/contracts').NoDuesAnalyticsOutput}>}
 */
export async function getNoDuesAnalytics(filters = {}) {
  const module = await loadModule('noDuesAnalytics');
  if (module?.getNoDuesAnalytics) {
    return { source: 'member3', data: await module.getNoDuesAnalytics(filters) };
  }

  const supabase = getSupabase();
  const [studentsRes, itemsRes, clearRes] = await Promise.all([
    supabase.from('students').select('id, department_id, graduation_year, departments(code)'),
    supabase.from('clearance_items').select('id, department_id, name, is_mandatory, is_active'),
    supabase.from('student_clearances').select('id, student_id, clearance_item_id, status, approved_by, approved_at'),
  ]);
  if (studentsRes.error) throw new Error(studentsRes.error.message);
  if (itemsRes.error) throw new Error(itemsRes.error.message);
  if (clearRes.error) throw new Error(clearRes.error.message);

  const students = studentsRes.data ?? [];
  const items = itemsRes.data ?? [];
  const clearances = clearRes.data ?? [];

  const f = {
    department_ids: filters.department_ids ?? [],
    graduation_years: filters.graduation_years ?? [],
  };
  const cohort = students.filter(
    (s) =>
      (!f.department_ids.length || f.department_ids.includes(s.department_id)) &&
      (!f.graduation_years.length || f.graduation_years.includes(s.graduation_year)),
  );

  const byDeptItems = new Map();
  for (const item of items) {
    if (item.is_active && item.is_mandatory) {
      if (!byDeptItems.has(item.department_id)) byDeptItems.set(item.department_id, []);
      byDeptItems.get(item.department_id).push(item);
    }
  }
  const clearByKey = new Map(clearances.map((c) => [`${c.student_id}:${c.clearance_item_id}`, c]));

  let cleared = 0;
  let pending = 0;
  let notConfigured = 0;
  const mandatoryItems = { cleared: 0, not_applicable: 0, pending: 0, missing: 0 };
  const byDeptMap = new Map();

  for (const s of cohort) {
    const deptItems = byDeptItems.get(s.department_id) ?? [];
    if (!byDeptMap.has(s.department_id)) {
      byDeptMap.set(s.department_id, {
        department_id: s.department_id,
        department_code: s.departments?.code ?? '—',
        total_students: 0,
        cleared_students: 0,
        pending_students: 0,
        not_configured_students: 0,
      });
    }
    const dept = byDeptMap.get(s.department_id);
    dept.total_students += 1;

    if (deptItems.length === 0) {
      notConfigured += 1;
      dept.not_configured_students += 1;
      continue;
    }
    let allSatisfied = true;
    for (const item of deptItems) {
      const row = clearByKey.get(`${s.id}:${item.id}`);
      if (!row) {
        mandatoryItems.missing += 1;
        allSatisfied = false;
      } else if (row.status === 'cleared' && row.approved_by && row.approved_at) {
        mandatoryItems.cleared += 1;
      } else if (row.status === 'not_applicable' && row.approved_by && row.approved_at) {
        mandatoryItems.not_applicable += 1;
      } else {
        mandatoryItems.pending += 1;
        allSatisfied = false;
      }
    }
    if (allSatisfied) {
      cleared += 1;
      dept.cleared_students += 1;
    } else {
      pending += 1;
      dept.pending_students += 1;
    }
  }

  const by_department = [...byDeptMap.values()]
    .map((d) => ({
      ...d,
      clearance_rate: rate(d.cleared_students, d.total_students),
    }))
    .sort((a, b) => a.department_code.localeCompare(b.department_code) || a.department_id.localeCompare(b.department_id));

  return {
    source: 'snapshot',
    data: {
      contract_version: '1.1.0',
      snapshot_at: new Date().toISOString(),
      filters,
      total_students: cohort.length,
      cleared_students: cleared,
      pending_students: pending,
      not_configured_students: notConfigured,
      clearance_rate: rate(cleared, cohort.length),
      mandatory_items: mandatoryItems,
      by_department,
      filtered: hasAny(filters),
    },
  };
}
