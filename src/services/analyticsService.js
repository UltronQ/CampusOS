import { getSupabase } from '../lib/supabaseClient';

/**
 * Analytics boundary for the dashboards (Member 1, M1-4).
 *
 * Per the shared prompt, dashboard totals MUST come from Member 3's analytics
 * services when available — never from naively counting application rows.
 * Member 3's implementation modules are not committed yet, so this module:
 *   1. Auto-discovers src/features/analytics/placementAnalytics.js and
 *      noDuesAnalytics.js via import.meta.glob the moment they land.
 *   2. Until then it computes totals from a single authorized snapshot using
 *      the contract's placement rules (distinct placed students, offered/
 *      accepted offers only, cancelled drives + withdrawn apps excluded) — the
 *      same semantics Member 3's implementation must satisfy. It is clearly
 *      labelled as a snapshot summary, not a substitute contract.
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

function salaryStats(minors) {
  const values = minors.filter((v) => Number.isInteger(v) && v >= 0).sort((a, b) => a - b);
  if (values.length === 0) {
    return { count: 0, min_minor: null, max_minor: null, mean_minor: null, median_minor: null, currency: 'INR' };
  }
  const sum = values.reduce((acc, v) => acc + v, 0);
  const mid = Math.floor(values.length / 2);
  const median =
    values.length % 2 ? values[mid] : Math.round((values[mid - 1] + values[mid]) / 2);
  return {
    count: values.length,
    min_minor: values[0],
    max_minor: values[values.length - 1],
    mean_minor: Math.round(sum / values.length),
    median_minor: median,
    currency: 'INR',
  };
}

function hasAny(filters) {
  return Object.values(filters ?? {}).some((value) =>
    Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined && value !== '',
  );
}

/**
 * Placement analytics. Delegates to Member 3 when present; otherwise one
 * authorized snapshot applying the documented placement rules.
 * @returns {Promise<{source:'member3'|'snapshot', data: import('../features/data/contracts').PlacementAnalyticsOutput}>}
 */
export async function getPlacementAnalytics(filters = {}) {
  const module = await loadModule('placementAnalytics');
  if (module?.getPlacementAnalytics) {
    return { source: 'member3', data: await module.getPlacementAnalytics(filters) };
  }

  const supabase = getSupabase();
  const [studentsRes, offersRes, appsRes] = await Promise.all([
    supabase.from('students').select('id, department_id, graduation_year, departments(code)'),
    supabase
      .from('offers')
      .select('id, status, annual_ctc_minor, currency, applications(id, status, drive_id, student_id, drives(id, status, company_id, start_date, companies(id, name)))'),
    supabase
      .from('applications')
      .select('id, status, student_id, drive_id, drives(id, status, company_id, start_date)'),
  ]);
  if (studentsRes.error) throw new Error(studentsRes.error.message);
  if (offersRes.error) throw new Error(offersRes.error.message);
  if (appsRes.error) throw new Error(appsRes.error.message);

  const students = studentsRes.data ?? [];
  const offers = offersRes.data ?? [];
  const applications = appsRes.data ?? [];

  const f = {
    department_ids: filters.department_ids ?? [],
    graduation_years: filters.graduation_years ?? [],
    company_ids: filters.company_ids ?? [],
    drive_ids: filters.drive_ids ?? [],
  };

  const cohort = students.filter(
    (s) =>
      (!f.department_ids.length || f.department_ids.includes(s.department_id)) &&
      (!f.graduation_years.length || f.graduation_years.includes(s.graduation_year)),
  );
  const cohortIds = new Set(cohort.map((s) => s.id));

  const scopedApp = (app) =>
    cohortIds.has(app.student_id) &&
    app.drives &&
    ['published', 'completed'].includes(app.drives.status) &&
    app.status !== 'withdrawn' &&
    (!f.company_ids.length || f.company_ids.includes(app.drives.company_id)) &&
    (!f.drive_ids.length || f.drive_ids.includes(app.drive_id));

  const eligibleDriveIds = new Set(
    applications.filter(scopedApp).map((app) => app.drive_id),
  );

  const eligibleStudents = new Set();
  for (const app of applications) {
    if (scopedApp(app) && eligibleDriveIds.has(app.drive_id)) eligibleStudents.add(app.student_id);
  }

  const successful = offers.filter((offer) => {
    const app = offer.applications;
    return (
      ['offered', 'accepted'].includes(offer.status) && app && scopedApp(app)
    );
  });

  const placedIds = new Set(successful.map((o) => o.applications.student_id));
  const placed = placedIds.size;
  const perStudentOffers = {};
  for (const offer of successful) {
    const sid = offer.applications.student_id;
    perStudentOffers[sid] = (perStudentOffers[sid] ?? 0) + 1;
  }
  const multiOffer = Object.values(perStudentOffers).filter((n) => n >= 2).length;
  const salary = salaryStats(successful.map((o) => o.annual_ctc_minor));
  const appCount = applications.filter(scopedApp).length;

  // Department summaries — every cohort department appears, even at zero.
  const byDeptMap = new Map();
  for (const s of cohort) {
    const key = s.department_id;
    if (!byDeptMap.has(key)) {
      byDeptMap.set(key, {
        department_id: key,
        department_code: s.departments?.code ?? '—',
        total_students: 0,
        eligible_students: 0,
        placed_students: 0,
        unplaced_students: 0,
        successful_offers: 0,
      });
    }
    byDeptMap.get(key).total_students += 1;
    if (eligibleStudents.has(s.id)) byDeptMap.get(key).eligible_students += 1;
    if (placedIds.has(s.id)) byDeptMap.get(key).placed_students += 1;
  }
  for (const offer of successful) {
    const sid = offer.applications.student_id;
    const student = cohort.find((s) => s.id === sid);
    if (!student) continue;
    const entry = byDeptMap.get(student.department_id);
    if (entry) entry.successful_offers += 1;
  }
  const by_department = [...byDeptMap.values()]
    .map((d) => ({
      ...d,
      unplaced_students: d.eligible_students - d.placed_students,
      placement_rate: rate(d.placed_students, d.eligible_students),
    }))
    .sort((a, b) => a.department_code.localeCompare(b.department_code) || a.department_id.localeCompare(b.department_id));

  // Company outcomes — distinct placed students per company over scoped drives.
  const companyMap = new Map();
  for (const offer of successful) {
    const company = offer.applications.drives?.companies;
    if (!company) continue;
    if (!companyMap.has(company.id)) {
      companyMap.set(company.id, { company_id: company.id, company_name: company.name, placed_students: new Set(), offers: 0 });
    }
    const entry = companyMap.get(company.id);
    entry.placed_students.add(offer.applications.student_id);
    entry.offers += 1;
  }
  const companies = [...companyMap.values()]
    .map((c) => ({ company_id: c.company_id, company_name: c.company_name, placed_students: c.placed_students.size, offers: c.offers }))
    .sort((a, b) => b.placed_students - a.placed_students || a.company_name.localeCompare(b.company_name));

  return {
    source: 'snapshot',
    data: {
      contract_version: '1.1.0',
      snapshot_at: new Date().toISOString(),
      filters,
      total_students: cohort.length,
      eligible_students: eligibleStudents.size,
      placed_students: placed,
      unplaced_students: eligibleStudents.size - placed,
      placement_rate: rate(placed, eligibleStudents.size),
      applications: appCount,
      successful_offers: successful.length,
      students_with_multiple_offers: multiOffer,
      salary,
      by_department,
      companies,
      filtered: hasAny(filters),
    },
  };
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
