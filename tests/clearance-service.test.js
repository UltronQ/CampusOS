import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClearanceService } from '../src/services/clearanceBackend.js';

function fixture(result = { data: { id: 'decision' }, error: null }) {
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
  return { service: createClearanceService(client), calls };
}

test('approval derives actor and timestamps on server and resolves pending requirements', async () => {
  const { service, calls } = fixture();
  assert.deepEqual(await service.approveClearance('decision', 'forged-user', 'cleared', { remarks: 'Returned books' }), { id: 'decision' });
  assert.deepEqual(calls.slice(0, 3), [['from', 'student_clearances'],
    ['update', { remarks: 'Returned books', status: 'cleared', pending_requirements: [] }],
    ['eq', 'id', 'decision']]);
});
test('rejected decisions carry remarks and pending requirements', async () => {
  const { service, calls } = fixture();
  await service.setClearanceStatus('decision', 'rejected', { remarks: 'Unpaid fees', pending_requirements: ['Submit receipt'] });
  assert.deepEqual(calls[1], ['update', { remarks: 'Unpaid fees', pending_requirements: ['Submit receipt'], status: 'rejected' }]);
});
test('invalid statuses, approval payloads and unresolved success updates are rejected', () => {
  const { service } = fixture();
  for (const status of ['approved', 'incomplete', 'further_action_required', null]) {
    assert.throws(() => service.setClearanceStatus('decision', status), /Invalid clearance status/);
  }
  for (const details of [{ approved_by: 'other' }, { approved_at: '2020-01-01' }, { updated_by: 'other' }, { student_id: 'other' }]) {
    assert.throws(() => service.setClearanceStatus('decision', 'cleared', details), /Unsupported fields/);
  }
  assert.throws(() => service.setClearanceStatus('decision', 'cleared', { pending_requirements: ['Return key'] }), /Resolved items/);
  for (const pending_requirements of [[' '], [null], 'receipt', [123]]) {
    assert.throws(() => service.setClearanceStatus('decision', 'pending', { pending_requirements }), /nonempty text/);
  }
  assert.throws(() => service.setClearanceStatus('decision', 'pending', { remarks: 42 }), /Remarks must be text/);
  assert.throws(() => service.approveClearance('decision', 'actor', 'rejected'), /Invalid approval status/);
});
test('checklist initialization and statement use trusted RPCs', async () => {
  const { service, calls } = fixture();
  await service.initializeStudentClearances('student');
  await service.getStudentNoDuesStatement('student');
  assert.deepEqual(calls, [
    ['rpc', 'initialize_student_clearances', { p_student_id: 'student' }],
    ['rpc', 'get_student_no_dues_statement', { p_student_id: 'student' }],
  ]);
});
test('progress carries intersecting department/batch filters and rejects client roles', async () => {
  const { service, calls } = fixture();
  await service.getNoDuesProgress({ department_ids: ['department'], graduation_years: [2027] });
  assert.deepEqual(calls[0], ['rpc', 'get_no_dues_progress', { p_department_ids: ['department'], p_graduation_years: [2027] }]);
  for (const filters of [{ role: 'placement_incharge' }, { graduation_years: ['2027'] },
    { graduation_years: [2100] }, { department_ids: [null] }, { department_ids: null }]) {
    assert.throws(() => service.getNoDuesProgress(filters), TypeError);
  }
});
test('configuration updates cannot reparent categories or submit audit metadata', async () => {
  const { service, calls } = fixture();
  await service.updateClearanceItem('category', { is_mandatory: false, is_active: true });
  assert.deepEqual(calls[1], ['update', { is_mandatory: false, is_active: true }]);
  assert.throws(() => service.updateClearanceItem('category', { department_id: 'other' }), /Unsupported fields/);
  assert.throws(() => service.updateClearanceItem('category', {}), /Empty category update/);
});
test('forbidden, missing-row and database validation errors are propagated unchanged', async () => {
  for (const code of ['42501', '23514', 'PGRST116', '23503']) {
    const error = { code };
    const { service } = fixture({ data: null, error });
    await assert.rejects(service.setClearanceStatus('decision', 'cleared'), e => e === error);
    await assert.rejects(service.getStudentNoDuesStatement('other'), e => e === error);
    await assert.rejects(service.deleteClearanceItem('category'), e => e === error);
  }
});
