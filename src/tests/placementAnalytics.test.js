import test from 'node:test';
import assert from 'node:assert/strict';
import { analyticsFixture } from './fixtures/placementAnalytics.fixture.js';
import { formatCtc } from '../app/placementLabels.js';
import { calculatePlacementAnalytics as calculate, normalizePlacementFilters, packageStatistics, placementRate, createPlacementAnalyticsService, isStudentEligibleForDrive } from '../features/analytics/placementAnalytics.js';

test('multiple offers count unique students; withdrawn, cancelled, rejected and invalid eligibility do not place students', () => {
  const result = calculate(analyticsFixture());
  assert.equal(result.total_students, 6);
  assert.equal(result.registered_students, 4);
  assert.equal(result.eligible_students, 5); // s3 has no active application but meets stored criteria.
  assert.equal(result.participating_students, 5);
  assert.equal(result.placed_students, 2);
  assert.equal(result.successful_offers, 3);
  assert.equal(result.students_with_multiple_offers, 1);
  assert.equal(result.unplaced_students, 4);
  assert.deepEqual(result.placement_rate, { numerator: 2, denominator: 6, percent: 33.33 });
  assert.equal(result.placement_denominator, 'cohort_students');
  assert.deepEqual(result.salary, { currency: 'INR', count: 2, min_minor: 100, max_minor: 200, mean_minor: 150, median_minor: 150 });
  assert.equal(result.excluded_package_offers, 1);
  assert.equal(result.applications, 7);
});

test('company selections include selected students without offers and never sum into global unique placement', () => {
  const { companies, placed_students } = calculate(analyticsFixture());
  assert.deepEqual(companies, [
    { company_id: 'c1', company_name: 'Demo One', selections: 3, selected_applications: 3, placed_students: 2, offers: 2 },
    { company_id: 'c2', company_name: 'Demo Two', selections: 1, selected_applications: 1, placed_students: 1, offers: 1 },
  ]);
  assert.equal(placed_students, 2);
});

test('all filters intersect consistently across metrics, breakdowns, salaries and trends', () => {
  const filters = [
    { department_ids: ['cse'] }, { graduation_years: [2028] }, { company_ids: ['c2'] },
    { drive_statuses: ['completed'] }, { drive_ids: ['d1'] },
    { drive_start_from: '2026-10-10', drive_start_to: '2026-10-10' },
    { department_ids: ['cse'], graduation_years: [2027], company_ids: ['c2'], drive_statuses: ['completed'] },
    { drive_statuses: ['cancelled'] }, { drive_statuses: ['draft'] }, { department_ids: ['missing'] },
  ];
  for (const filter of filters) {
    const result = calculate(analyticsFixture(), filter);
    for (const key of ['total_students', 'registered_students', 'eligible_students', 'participating_students', 'placed_students', 'unplaced_students', 'successful_offers']) {
      assert.equal(result.by_department.reduce((sum, row) => sum + row[key], 0), result[key], key + JSON.stringify(filter));
      if (result.batch_trends.length) assert.equal(result.batch_trends.reduce((sum, row) => sum + row[key], 0), result[key]);
    }
    assert.equal(result.companies.reduce((sum, row) => sum + row.offers, 0), result.successful_offers);
    assert.equal(result.placed_students + result.unplaced_students, result.total_students);
    assert.equal(result.placement_rate.denominator, result.total_students);
    assert.ok(result.placement_rate.percent === null || result.placement_rate.percent <= 100);
  }
  const scoped = calculate(analyticsFixture(), filters[6]);
  assert.equal(scoped.total_students, 3);
  assert.equal(scoped.placed_students, 1);
  assert.equal(scoped.participating_students, 2);
  assert.equal(scoped.salary.mean_minor, 200);
  assert.equal(scoped.placement_rate.percent, 33.33);
  assert.equal(calculate(analyticsFixture(), { graduation_years: [2028] }).placed_students, 0);
  for (const status of ['draft', 'cancelled']) assert.equal(calculate(analyticsFixture(), { drive_statuses: [status] }).successful_offers, 0);
});

test('eligible students are computed without applications, both criteria families apply and null academics are unknown', () => {
  const snapshot = analyticsFixture();
  snapshot.applications = []; snapshot.offers = [];
  const result = calculate(snapshot);
  assert.equal(result.eligible_students, 5);
  assert.equal(result.participating_students, 0);
  assert.equal(result.unplaced_students, 6);
  const s = snapshot.students[0];
  assert.equal(isStudentEligibleForDrive(s, { id: 'd', department_ids: ['cse'] }, [{ drive_id: 'd', department_id: 'ece' }]), false);
  assert.equal(isStudentEligibleForDrive(s, { id: 'd', min_cgpa: 8, minimum_cgpa: 10 }), false);
  assert.equal(isStudentEligibleForDrive({ ...s, backlogs: null }, { id: 'd', max_backlogs: 0 }), false);
});

test('empty and unplaced datasets return zero counts and honest null packages/percentages', () => {
  const snapshot = analyticsFixture();
  for (const key of ['students', 'drives', 'drive_departments', 'applications', 'offers']) snapshot[key] = [];
  const result = calculate(snapshot);
  assert.equal(result.total_students, 0);
  assert.equal(result.registered_students, 0);
  assert.equal(result.eligible_students, 0);
  assert.equal(result.participating_students, 0);
  assert.equal(result.placed_students, 0);
  assert.equal(result.unplaced_students, 0);
  assert.equal(result.placement_rate.percent, null);
  assert.equal(result.salary.max_minor, null);
  assert.equal(result.salary.mean_minor, null);
  assert.deepEqual(result.batch_trends, []);
  const unplaced = analyticsFixture(); unplaced.offers = [];
  assert.equal(calculate(unplaced).unplaced_students, 6);
  assert.equal(calculate(unplaced).placement_rate.percent, 0);
});

test('packages ignore malformed data, preserve zero, use exact integer arithmetic and separate currencies', () => {
  assert.equal(formatCtc(100), '₹1.00');
  assert.equal(formatCtc(150, 'USD'), 'USD 1.50');
  assert.equal(formatCtc(null), '—');
  assert.deepEqual(packageStatistics([null, '', ' 2', '1.5', -1, Infinity, NaN, 1.2, '9007199254740992']), packageStatistics([]));
  assert.equal(packageStatistics([0, '0']).count, 2);
  assert.equal(packageStatistics([0, 1]).mean_minor, 1);
  assert.equal(packageStatistics([Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]).mean_minor, Number.MAX_SAFE_INTEGER);
  assert.equal(placementRate(1, 32).percent, 3.13);
  const snapshot = analyticsFixture(); snapshot.offers[1].currency = 'USD';
  const result = calculate(snapshot);
  assert.equal(result.salary.mean_minor, 100);
  assert.equal(result.salary_by_currency.find((s) => s.currency === 'USD').mean_minor, 200);
  assert.equal(result.placed_students, 2);
  snapshot.offers[0].annual_ctc_minor = 'invalid'; snapshot.offers[1].annual_ctc_minor = null;
  assert.equal(calculate(snapshot).salary.count, 0);
  assert.equal(calculate(snapshot).successful_offers, 3);
});

test('trends exist only for multiple stored graduation batches and calculations are order independent', () => {
  const snapshot = analyticsFixture();
  const result = calculate(snapshot);
  assert.deepEqual(result.batch_trends.map((r) => r.graduation_year), [2027, 2028]);
  assert.deepEqual(calculate(snapshot, { graduation_years: [2027] }).batch_trends, []);
  for (const value of Object.values(snapshot)) if (Array.isArray(value)) value.reverse();
  assert.deepEqual(calculate(snapshot), result);
});

test('malformed filters and incomplete/duplicate snapshots fail rather than returning partial results', () => {
  for (const input of [{ company_ids: 'c1' }, { drive_statuses: ['open'] }, { graduation_years: ['2027'] }, { role: 'placement_incharge' }, { drive_start_from: '2026-02-30' }, { drive_start_from: '2027-01-01', drive_start_to: '2026-01-01' }]) {
    assert.throws(() => normalizePlacementFilters(input), { code: 'INVALID_INPUT' });
  }
  assert.deepEqual(normalizePlacementFilters({ department_ids: ['b', 'a', 'b'] }).department_ids, ['a', 'b']);
  const snapshot = analyticsFixture(); delete snapshot.offers;
  assert.throws(() => calculate(snapshot), { code: 'DATABASE_ERROR' });
  const duplicate = analyticsFixture(); duplicate.offers.push(duplicate.offers[0]);
  assert.throws(() => calculate(duplicate), { code: 'DATABASE_ERROR' });
});

test('service reads the real RPC once, validates before queries, and never substitutes records on failure', async () => {
  let calls = 0;
  const service = createPlacementAnalyticsService(() => ({ rpc: async (name) => {
    assert.equal(name, 'get_placement_analytics_snapshot'); calls++; return { data: analyticsFixture(), error: null };
  } }));
  await assert.rejects(service.getPlacementAnalytics({ company_ids: 'bad' }), { code: 'INVALID_INPUT' });
  assert.equal(calls, 0);
  assert.equal((await service.getPlacementAnalytics()).placed_students, 2);
  assert.equal(calls, 1);
  const denied = createPlacementAnalyticsService(() => ({ rpc: async () => ({ error: { message: 'Access denied', code: '42501' } }) }));
  await assert.rejects(denied.getPlacementAnalytics(), { code: 'FORBIDDEN' });
});
