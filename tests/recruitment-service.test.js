import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRecruitmentService } from '../src/services/recruitmentBackend.js';

function fixture(result = { data: { id: 'row' }, error: null }) {
  const calls = [];
  const query = {};
  for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'order', 'single']) {
    query[method] = (...args) => { calls.push([method, ...args]); return query; };
  }
  query.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  const client = {
    from: table => { calls.push(['from', table]); return query; },
    rpc: (name, params) => { calls.push(['rpc', name, params]); return query; },
  };
  return { service: createRecruitmentService(client), calls };
}

test('application insert carries only student and drive identities', async () => {
  const { service, calls } = fixture();
  assert.deepEqual(await service.applyToDrive('student', 'drive'), { id: 'row' });
  assert.deepEqual(calls[1], ['insert', { student_id: 'student', drive_id: 'drive' }]);
});
test('eligibility uses server RPC and propagates forbidden identities', async () => {
  const forbidden = { code: '42501', message: 'Student access denied' };
  const { service, calls } = fixture({ data: null, error: forbidden });
  await assert.rejects(service.getStudentDrives('other'), error => error === forbidden);
  assert.deepEqual(calls[0], ['rpc', 'get_student_drives', { p_student_id: 'other' }]);
});
test('offer payload cannot override its application identity', () => {
  const { service } = fixture();
  assert.throws(() => service.createOffer('own', { application_id: 'other' }), /Unsupported fields/);
  assert.throws(() => service.updateDrive('drive', { company_id: 'other' }), /Unsupported fields/);
  assert.throws(() => service.updateOffer('offer', {}), /Empty update/);
});
test('withdrawal targets the exact row and status', async () => {
  const { service, calls } = fixture();
  await service.withdrawApplication('app');
  assert.deepEqual(calls.slice(0, 3), [['from', 'applications'], ['update', { status: 'withdrawn' }], ['eq', 'id', 'app']]);
});
test('invalid transitions, unauthorized writes and dependent deletes propagate database errors', async () => {
  for (const code of ['23514', '42501', '23503', 'PGRST116']) {
    const error = { code };
    const { service } = fixture({ data: null, error });
    await assert.rejects(service.updateOfferStatus('offer', 'accepted'), e => e === error);
    await assert.rejects(service.deleteDrive('drive'), e => e === error);
  }
});
test('success counts come from the RLS-scoped backend aggregate', async () => {
  const counts = { successful_offers: 2, placed_students: 1 };
  const { service, calls } = fixture({ data: [counts], error: null });
  assert.deepEqual(await service.getRecruitmentSuccessCounts(), counts);
  assert.deepEqual(calls[0], ['rpc', 'get_recruitment_success_counts', { p_drive_id: null }]);
});
test('normal offer creation preserves integer compensation', async () => {
  const { service, calls } = fixture();
  await service.createOffer('app', { annual_ctc_minor: 150000000, currency: 'INR' });
  assert.deepEqual(calls[1], ['insert', { annual_ctc_minor: 150000000, currency: 'INR', application_id: 'app' }]);
});
