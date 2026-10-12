import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase, withUser, readProjectFile } from './helpers/database.js';
import { calculatePlacementAnalytics, createPlacementAnalyticsService } from '../features/analytics/placementAnalytics.js';

test('placement snapshot RPC enforces roles and calculates from complete real stored records', async () => {
  const db = await createTestDatabase();
  const admin = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const student = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  try {
    await db.query('INSERT INTO auth.users(id) VALUES ($1),($2)', [admin, student]);
    await db.query("INSERT INTO profiles(id,role) VALUES ($1,'placement_incharge'),($2,'student')", [admin, student]);
    await db.exec(await readProjectFile('supabase/seed/seed.sql'));
    await assert.rejects(withUser(db, student, () => db.query('SELECT public.get_placement_analytics_snapshot()')), { code: '42501' });
    await assert.rejects(withUser(db, null, () => db.query('SELECT public.get_placement_analytics_snapshot()')), { code: '42501' });
    await assert.rejects(withUser(db, null, () => db.query('SELECT public.get_placement_analytics_snapshot()'), 'anon'), { code: '42501' });
    const service = createPlacementAnalyticsService(() => ({ rpc: async (name) => {
      assert.equal(name, 'get_placement_analytics_snapshot');
      return { data: (await withUser(db, admin, () => db.query('SELECT public.get_placement_analytics_snapshot() AS data'))).rows[0].data, error: null };
    } }));
    const result = await service.getPlacementAnalytics();
    assert.equal(result.total_students, 5);
    assert.equal(result.registered_students, 0);
    assert.equal(result.placed_students, 2);
    assert.equal(result.successful_offers, 3);
    assert.equal(result.students_with_multiple_offers, 1);
    assert.equal(result.salary.count, 2);
    assert.equal(result.salary.max_minor, 20000000);
    assert.equal(result.salary.mean_minor, 15000000);
    assert.equal(result.unplaced_students, 3);
    assert.equal(result.placement_rate.percent, 40);
    // More than Supabase's default REST row cap. The scalar JSON RPC is complete.
    await db.exec(`INSERT INTO students(student_number,full_name,email,department_id,graduation_year,placement_registered)
      SELECT 'ANALYTICS-' || n, 'Demo Analytics ' || n, 'analytics-' || n || '@example.test',
        '11111111-1111-1111-1111-111111111111'::uuid, 2029, TRUE FROM generate_series(1,1005) n`);
    const expanded = await service.getPlacementAnalytics();
    assert.equal(expanded.total_students, 1010);
    assert.equal(expanded.registered_students, 1005);
    assert.equal(expanded.placed_students, 2);
    const snapshot = (await withUser(db, admin, () => db.query('SELECT public.get_placement_analytics_snapshot() AS data'))).rows[0].data;
    assert.equal(snapshot.students.length, 1010);
    assert.ok(!Object.hasOwn(snapshot.students[0], 'email'), 'Analytics must not expose unnecessary student PII');
    assert.deepEqual(calculatePlacementAnalytics(snapshot, { drive_statuses: ['cancelled'] }).salary, {
      currency: 'INR', count: 0, min_minor: null, max_minor: null, mean_minor: null, median_minor: null,
    });
  } finally { await db.close(); }
});
