import { DATA_CONTRACT_VERSION, DRIVE_STATUSES } from '../data/contracts.js';

const active = new Set(['published', 'completed']);
const compare = (a, b) => String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
const invalid = (message) => Object.assign(new Error(message), { code: 'INVALID_INPUT' });
const integrity = (message) => Object.assign(new Error(message), { code: 'DATABASE_ERROR' });
const roundedDivide = (n, d) => Number((n * 2n + d) / (d * 2n));
export function placementRate(numerator, denominator) {
  return { numerator, denominator, percent: denominator ? roundedDivide(BigInt(numerator) * 10000n, BigInt(denominator)) / 100 : null };
}

export function normalizePlacementFilters(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid('Filters must be an object.');
  const keys = ['department_ids', 'graduation_years', 'company_ids', 'drive_ids', 'drive_statuses', 'drive_start_from', 'drive_start_to'];
  if (Object.keys(input).some((key) => !keys.includes(key))) throw invalid('Unknown placement filter.');
  const array = (key, valid) => {
    const value = input[key] ?? [];
    if (!Array.isArray(value) || value.some((item) => !valid(item))) throw invalid('Invalid ' + key + ' filter.');
    return [...new Set(value)].sort(key === 'graduation_years' ? (a, b) => a - b : compare);
  };
  const id = (v) => typeof v === 'string' && v.length > 0 && v.trim() === v;
  const date = (key) => {
    const value = input[key] ?? null;
    if (value === null) return null;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw invalid('Invalid ' + key + ' date.');
    return value;
  };
  const filters = {
    department_ids: array('department_ids', id), graduation_years: array('graduation_years', (v) => Number.isInteger(v) && v >= 1900 && v <= 2100),
    company_ids: array('company_ids', id), drive_ids: array('drive_ids', id),
    drive_statuses: array('drive_statuses', (v) => DRIVE_STATUSES.includes(v)),
    drive_start_from: date('drive_start_from'), drive_start_to: date('drive_start_to'),
  };
  if (!filters.drive_statuses.length) filters.drive_statuses = ['completed', 'published'];
  if (filters.drive_start_from && filters.drive_start_to && filters.drive_start_from > filters.drive_start_to) throw invalid('Start date must precede end date.');
  return filters;
}

function numeric(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value)) return Number(value);
  return null;
}
function compensation(value) {
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const integer = BigInt(value);
    return integer <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(integer) : null;
  }
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}
export function packageStatistics(values, currency = 'INR') {
  const amounts = values.map(compensation).filter((value) => value !== null).sort((a, b) => a - b);
  if (!amounts.length) return { currency, count: 0, min_minor: null, max_minor: null, mean_minor: null, median_minor: null };
  const middle = Math.floor(amounts.length / 2);
  const sum = amounts.reduce((n, value) => n + BigInt(value), 0n);
  return {
    currency, count: amounts.length, min_minor: amounts[0], max_minor: amounts.at(-1),
    mean_minor: roundedDivide(sum, BigInt(amounts.length)),
    median_minor: amounts.length % 2 ? amounts[middle] : roundedDivide(BigInt(amounts[middle - 1]) + BigInt(amounts[middle]), 2n),
  };
}

/** Both deployed drive field families restrict eligibility; blank criteria mean unrestricted. */
export function isStudentEligibleForDrive(student, drive, departmentLinks = []) {
  const departments = drive.department_ids ?? [];
  const linked = departmentLinks.filter((link) => link.drive_id === drive.id).map((link) => link.department_id);
  if ((departments.length && !departments.includes(student.department_id)) || (linked.length && !linked.includes(student.department_id))) return false;
  for (const years of [drive.graduation_years ?? [], drive.eligible_graduation_years ?? []]) {
    if (years.length && !years.includes(student.graduation_year)) return false;
  }
  for (const minimum of [drive.minimum_cgpa, drive.min_cgpa]) {
    if (minimum !== null && minimum !== undefined && (numeric(student.cgpa) === null || numeric(student.cgpa) < numeric(minimum))) return false;
  }
  for (const maximum of [drive.maximum_backlogs, drive.max_backlogs]) {
    if (maximum !== null && maximum !== undefined && (numeric(student.backlogs) === null || numeric(student.backlogs) > numeric(maximum))) return false;
  }
  return true;
}

/** Pure deterministic calculation. Only the authorized service supplies production records. */
export function calculatePlacementAnalytics(snapshot, input = {}) {
  const filters = normalizePlacementFilters(input);
  if (!snapshot || typeof snapshot.snapshot_at !== 'string' || !Number.isFinite(Date.parse(snapshot.snapshot_at))) throw integrity('Missing database snapshot timestamp.');
  const maps = {};
  for (const key of ['students', 'departments', 'companies', 'drives', 'applications', 'offers']) {
    if (!Array.isArray(snapshot[key])) throw integrity('Incomplete analytics snapshot: ' + key);
    maps[key] = new Map();
    for (const row of snapshot[key]) {
      if (!row || typeof row.id !== 'string' || maps[key].has(row.id)) throw integrity('Invalid or duplicate ' + key + ' identity.');
      maps[key].set(row.id, row);
    }
  }
  if (!Array.isArray(snapshot.drive_departments)) throw integrity('Missing drive department criteria.');
  const matches = (values, value) => !values.length || values.includes(value);
  const cohort = snapshot.students.filter((s) => matches(filters.department_ids, s.department_id) && matches(filters.graduation_years, s.graduation_year));
  const cohortMap = new Map(cohort.map((s) => [s.id, s]));
  const scopedDrives = snapshot.drives.filter((d) => matches(filters.company_ids, d.company_id) && matches(filters.drive_ids, d.id) &&
    filters.drive_statuses.includes(d.status) && (!filters.drive_start_from || d.start_date >= filters.drive_start_from) &&
    (!filters.drive_start_to || d.start_date <= filters.drive_start_to));
  const liveDrives = scopedDrives.filter((d) => active.has(d.status));
  const liveMap = new Map(liveDrives.map((d) => [d.id, d]));
  const eligibleByDrive = new Map(liveDrives.map((d) => [d.id, new Set(cohort.filter((s) => isStudentEligibleForDrive(s, d, snapshot.drive_departments)).map((s) => s.id))]));
  const eligibleIds = new Set([...eligibleByDrive.values()].flatMap((set) => [...set]));
  const applications = snapshot.applications.filter((a) => cohortMap.has(a.student_id) && liveMap.has(a.drive_id) && a.status !== 'withdrawn');
  const applicationMap = new Map(applications.map((a) => [a.id, a]));
  const participatingIds = new Set(applications.map((a) => a.student_id));
  const selected = applications.filter((a) => a.status === 'selected' && eligibleByDrive.get(a.drive_id).has(a.student_id));
  const selectedMap = new Map(selected.map((a) => [a.id, a]));
  const offers = snapshot.offers.filter((o) => ['offered', 'accepted'].includes(o.status) && selectedMap.has(o.application_id));
  const placedIds = new Set(offers.map((o) => applicationMap.get(o.application_id).student_id));
  const offerCounts = new Map();
  for (const o of offers) {
    const id = applicationMap.get(o.application_id).student_id;
    offerCounts.set(id, (offerCounts.get(id) ?? 0) + 1);
  }
  const summarize = (students) => {
    const ids = new Set(students.map((s) => s.id));
    const placed = students.filter((s) => placedIds.has(s.id)).length;
    return {
      total_students: students.length, registered_students: students.filter((s) => s.placement_registered === true).length,
      eligible_students: students.filter((s) => eligibleIds.has(s.id)).length,
      participating_students: students.filter((s) => participatingIds.has(s.id)).length,
      placed_students: placed, unplaced_students: students.length - placed,
      placement_rate: placementRate(placed, students.length),
      successful_offers: offers.filter((o) => ids.has(applicationMap.get(o.application_id).student_id)).length,
    };
  };
  const departmentIds = [...new Set(cohort.map((s) => s.department_id))];
  const by_department = departmentIds.map((id) => {
    if (!maps.departments.has(id)) throw integrity('Student department is missing.');
    return { department_id: id, department_code: maps.departments.get(id).code, ...summarize(cohort.filter((s) => s.department_id === id)) };
  }).sort((a, b) => compare(a.department_code, b.department_code) || compare(a.department_id, b.department_id));
  const companies = [...new Set(scopedDrives.map((d) => d.company_id))].map((id) => {
    if (!maps.companies.has(id)) throw integrity('Drive company is missing.');
    const companyApps = selected.filter((a) => liveMap.get(a.drive_id).company_id === id);
    const companyOffers = offers.filter((o) => liveMap.get(applicationMap.get(o.application_id).drive_id).company_id === id);
    return { company_id: id, company_name: maps.companies.get(id).name,
      selections: new Set(companyApps.map((a) => a.student_id)).size, selected_applications: companyApps.length,
      placed_students: new Set(companyOffers.map((o) => applicationMap.get(o.application_id).student_id)).size, offers: companyOffers.length };
  }).sort((a, b) => compare(a.company_name, b.company_name) || compare(a.company_id, b.company_id));
  const currencies = [...new Set(offers.map((o) => o.currency).filter((c) => typeof c === 'string' && /^[A-Z]{3}$/.test(c)))].sort(compare);
  const salary_by_currency = currencies.map((currency) => packageStatistics(offers.filter((o) => o.currency === currency).map((o) => o.annual_ctc_minor), currency));
  const years = [...new Set(cohort.map((s) => s.graduation_year))].sort((a, b) => a - b);
  return {
    contract_version: DATA_CONTRACT_VERSION, snapshot_at: snapshot.snapshot_at, filters, ...summarize(cohort),
    available_graduation_years: [...new Set(snapshot.students.map((s) => s.graduation_year))].sort((a, b) => a - b),
    placement_denominator: 'cohort_students', applications: applications.length,
    students_with_multiple_offers: [...offerCounts.values()].filter((count) => count >= 2).length,
    salary: salary_by_currency.find((s) => s.currency === 'INR') ?? packageStatistics([]), salary_by_currency,
    excluded_package_offers: offers.filter((o) => compensation(o.annual_ctc_minor) === null || typeof o.currency !== 'string' || !/^[A-Z]{3}$/.test(o.currency)).length,
    by_department, companies,
    batch_trends: years.length > 1 ? years.map((year) => ({ graduation_year: year, ...summarize(cohort.filter((s) => s.graduation_year === year)) })) : [],
  };
}

export function createPlacementAnalyticsService(getClient) {
  return {
    async getPlacementAnalytics(filters = {}) {
      const normalized = normalizePlacementFilters(filters);
      const { data, error } = await getClient().rpc('get_placement_analytics_snapshot');
      if (error) throw Object.assign(new Error(error.message), { code: error.code === '42501' ? 'FORBIDDEN' : 'DATABASE_ERROR', backend_code: error.code });
      return calculatePlacementAnalytics(data, normalized);
    },
  };
}

/** Database-backed public integration; no demo data, caching or silent fallback. */
export async function getPlacementAnalytics(filters = {}) {
  const { getSupabase } = await import('../../lib/supabaseClient.js');
  return createPlacementAnalyticsService(getSupabase).getPlacementAnalytics(filters);
}
