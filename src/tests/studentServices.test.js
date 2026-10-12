import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAuthSessionService, createRoleSessionResolver } from '../services/authSessionService.js';
import { createStudentManagementService } from '../services/studentManagementService.js';
import { toServiceError } from '../services/serviceError.js';

function queryClient(response = { data: [], error: null }) {
  const calls = [];
  const query = {};
  for (const name of ['select','eq','in','order','range','insert','update','delete']) {
    query[name] = (...args) => { calls.push([name, ...args]); return query; };
  }
  query.single = query.maybeSingle = () => Promise.resolve(response);
  query.then = (resolve, reject) => Promise.resolve(response).then(resolve, reject);
  return { calls, client: {
    from: (...args) => { calls.push(['from', ...args]); return query; },
    rpc: (...args) => { calls.push(['rpc', ...args]); return Promise.resolve(response); },
  } };
}

function authClient(role = 'student') {
  const session = { user: { id: 'test-user' }, access_token: 'test-token-not-a-credential' };
  let eventCallback;
  let signedOut = 0;
  let loginArgs;
  const client = {
    auth: {
      signInWithPassword: async (args) => { loginArgs = args; return { data: { session }, error: null }; },
      signOut: async () => { signedOut++; return { error: null }; },
      getSession: async () => ({ data: { session }, error: null }),
      getUser: async () => ({ data: { user: session.user }, error: null }),
      onAuthStateChange: (callback) => {
        eventCallback = callback;
        return { data: { subscription: { unsubscribe() {} } } };
      },
    },
    from: (table) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({
      data: table === 'profiles' ? role === null ? null : { id: 'test-user', role } : { id: 'student-id', user_id: 'test-user' }, error: null,
    }) }) }) }),
  };
  return { client, session, emit: (next) => eventCallback('SIGNED_IN', next), get signedOut() { return signedOut; }, get loginArgs() { return loginArgs; } };
}

test('real-client auth boundary supports both roles and verified restoration', async () => {
  for (const role of ['student', 'placement_incharge']) {
    const fixture = authClient(role);
    const service = createAuthSessionService(() => fixture.client);
    const result = await service.signInWithPassword(' DEMO@EXAMPLE.TEST ', 'synthetic-input');
    assert.equal(result.role, role); assert.equal(fixture.loginArgs.email, 'demo@example.test');
    const restored = await service.getRoleSession();
    assert.equal(restored.role, role);
    assert.equal(restored.student?.id ?? null, role === 'student' ? 'student-id' : null);
    assert.equal(await service.isPlacementIncharge(), role === 'placement_incharge');
    await service.signOut(); assert.equal(fixture.signedOut, 1);
  }
});

test('unprovisioned/unsupported roles are signed out; no role is fabricated', async () => {
  for (const role of [null, 'admin']) {
    const fixture = authClient(role);
    const service = createAuthSessionService(() => fixture.client);
    await assert.rejects(service.signInWithPassword('demo@example.test', 'synthetic-input'), { code: 'FORBIDDEN' });
    assert.equal(fixture.signedOut, 1);
  }
});

test('wrong credentials, missing input, mismatched and signed-out sessions fail safely', async () => {
  const fixture = authClient();
  const service = createAuthSessionService(() => fixture.client);
  await assert.rejects(service.signInWithPassword('', ''), { code: 'INVALID_INPUT' });
  fixture.client.auth.signInWithPassword = async () => ({ data: {}, error: { message: 'Do not expose this backend detail' } });
  await assert.rejects(service.signInWithPassword('demo@example.test', 'synthetic-input'), { code: 'UNAUTHORIZED', message: 'Sign-in failed. Check your credentials.' });
  fixture.client.auth.getUser = async () => ({ data: { user: { id: 'other-user' } }, error: null });
  await assert.rejects(service.getSession(), { code: 'UNAUTHORIZED' });
  fixture.client.auth.getSession = async () => ({ data: { session: null }, error: null });
  assert.deepEqual(await service.getRoleSession(), { session: null, profile: null, role: null, student: null });
  fixture.client.auth.getUser = async () => ({ data: {}, error: { name: 'AuthSessionMissingError' } });
  assert.equal(await service.getCurrentUser(), null);
  fixture.client.auth.signOut = async () => ({ error: { message: 'network error' } });
  await assert.rejects(service.signOut(), { code: 'UNAUTHORIZED' });
});

test('auth events defer profile work and unsubscribe cancels pending delivery', async () => {
  const fixture = authClient();
  const service = createAuthSessionService(() => fixture.client);
  const received = [];
  const unsubscribe = service.onAuthStateChange((session) => received.push(session));
  fixture.emit(fixture.session);
  assert.equal(received.length, 0);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(received, [fixture.session]);
  fixture.emit(null); unsubscribe();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(received.length, 1);
});

test('late profile response cannot restore an old role after account switch or logout', async () => {
  const waiting = new Map();
  const states = [];
  const resolver = createRoleSessionResolver({ fetchProfile: (id) => new Promise((resolve) => waiting.set(id, resolve)) }, (state) => states.push(state));
  const previous = resolver.resolve({ user: { id: 'previous' } });
  const next = resolver.resolve({ user: { id: 'next' } });
  waiting.get('next')({ id: 'next', role: 'student' }); await next;
  waiting.get('previous')({ id: 'previous', role: 'placement_incharge' }); await previous;
  assert.equal(states.at(-1).profile.role, 'student');
  const pending = resolver.resolve({ user: { id: 'pending' } });
  await resolver.resolve(null);
  waiting.get('pending')({ id: 'pending', role: 'placement_incharge' }); await pending;
  assert.equal(states.at(-1).session, null); assert.equal(states.at(-1).profile, null);
  resolver.stop();
});

test('directory sends typed filters as RPC parameters, not raw query syntax', async () => {
  const fake = queryClient({ data: { students: [], total: 0 }, error: null });
  const service = createStudentManagementService(() => fake.client);
  await service.listStudents({ q: 'a%,(b)', registered: 'false', batch: '2027', department_id: 'dept', eligibility: 'eligible', offset: 10, limit: 20 });
  assert.deepEqual(fake.calls[0], ['rpc','search_students', {
    p_query: 'a%,(b)', p_department_id: 'dept', p_graduation_year: 2027,
    p_registered: false, p_eligibility: 'eligible', p_offset: 10, p_limit: 20,
  }]);
  await assert.rejects(service.listStudents({ registered: 'maybe' }), { code: 'INVALID_INPUT' });
  await assert.rejects(service.listStudents({ batch: '2027.5' }), { code: 'INVALID_INPUT' });
});

test('student writes ignore read-only metadata and reject privilege fields', async () => {
  const fake = queryClient({ data: { id: 'student-id' }, error: null });
  const service = createStudentManagementService(() => fake.client);
  await service.updateStudent('student-id', { id: 'old-id', created_at: 'ignored', department: {}, full_name: 'Demo' });
  assert.deepEqual(fake.calls.find((call) => call[0] === 'update'), ['update', { full_name: 'Demo' }]);
  await assert.rejects(service.createStudent({ role: 'placement_incharge' }), { code: 'INVALID_INPUT' });
  await assert.rejects(service.createStudent({}), { code: 'INVALID_INPUT' });
});

test('duplicate lookup preserves text roll numbers and removes duplicate query inputs', async () => {
  const fake = queryClient();
  const service = createStudentManagementService(() => fake.client);
  await service.findExistingStudentNumbers(['001', ' 001 ', '002']);
  assert.deepEqual(fake.calls.find((call) => call[0] === 'in'), ['in', 'student_number', ['001','002']]);
  await assert.rejects(service.findExistingStudentNumbers([1]), { code: 'INVALID_INPUT' });
});

test('import never calls persistence before explicit confirmation and returns full counts', async () => {
  const result = { committed: true, inserted_count: 1, successful_count: 1, skipped_count: 1,
    failed_count: 1, total_count: 3, duplicate_count: 1, students: [{ source_row: 2, student_id: 'inserted' }],
    row_results: [{ source_row: 2, status: 'successful' }, { source_row: 3, status: 'skipped' }, { source_row: 4, status: 'failed' }] };
  const fake = queryClient({ data: result, error: null });
  const service = createStudentManagementService(() => fake.client);
  const rows = [{ source_row: 2, student: { student_number: '001' }, department_id: 'untrusted' },
    { source_row: 3, student: { student_number: '002' } }, { source_row: 4, student: { student_number: '003' } }];
  await assert.rejects(service.commitStudentImport({ rows }), { code: 'INVALID_INPUT' });
  assert.equal(fake.calls.length, 0);
  assert.equal(await service.importStudentRows(rows, { confirmed: true, mode: 'partial' }), result);
  assert.deepEqual(fake.calls[0], ['rpc', 'commit_student_import', {
    p_rows: rows.map(({ source_row, student }) => ({ source_row, student })), p_confirmed: true, p_mode: 'partial',
  }]);
  const broken = createStudentManagementService(() => queryClient({ data: {}, error: null }).client);
  await assert.rejects(broken.importStudentRows(rows, { confirmed: true }), { code: 'DATABASE_ERROR' });
});

test('denied/not-found deletes are not reported as success; conflicts retain stable codes', async () => {
  const fake = queryClient({ data: null, error: { code: 'PGRST116' } });
  const service = createStudentManagementService(() => fake.client);
  await assert.rejects(service.deleteStudent('student-id'), { code: 'NOT_FOUND' });
  assert.ok(fake.calls.some((call) => call[0] === 'select' && call[1] === 'id'));
  assert.equal(toServiceError({ code: '23001' }).code, 'CONFLICT');
  assert.equal(toServiceError({ code: '23505' }).code, 'CONFLICT');
  assert.equal(toServiceError({ code: '42501' }).code, 'FORBIDDEN');
});
