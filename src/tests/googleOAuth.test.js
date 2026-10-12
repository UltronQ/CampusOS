import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAuthSessionService } from '../services/authSessionService.js';
import { getAuthRedirectPath } from '../app/authNavigation.js';

function fixture(role = 'student', origin = 'http://localhost:5173') {
  const session = { user: { id: 'google-user', user_metadata: { role: 'placement_incharge' } }, access_token: 'test-only-token' };
  const calls = [];
  let signOuts = 0;
  const client = {
    auth: {
      signInWithOAuth: async args => { calls.push(['oauth', args]); return { data: { url: 'https://test.supabase.co/auth/v1/authorize?provider=google' } }; },
      exchangeCodeForSession: async code => { calls.push(['exchange', code]); return { data: { session } }; },
      getUser: async () => ({ data: { user: session.user } }),
      signOut: async () => { signOuts++; return { error: null }; },
    },
    from: table => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data:
      table === 'profiles' && role ? { id: session.user.id, role } : null, error: null,
    }) }) }) }),
  };
  const service = createAuthSessionService(() => client, () => true, { getOrigin: () => origin, isGoogleEnabled: async () => true });
  return { service, client, calls, session, get signOuts() { return signOuts; } };
}

test('Google OAuth uses the current origin callback and account selection, without requesting extra scopes', async () => {
  const f = fixture();
  const result = await f.service.signInWithGoogle();
  assert.match(result.url, /provider=google/);
  assert.deepEqual(f.calls[0], ['oauth', { provider: 'google', options: {
    redirectTo: 'http://localhost:5173/auth/callback', skipBrowserRedirect: true, queryParams: { prompt: 'select_account' },
  } }]);
});
test('unconfigured/disabled Google and insecure deployment origins never start OAuth', async () => {
  const f = fixture();
  await assert.rejects(createAuthSessionService(() => f.client, () => false).signInWithGoogle(), { code: 'INVALID_INPUT' });
  await assert.rejects(createAuthSessionService(() => f.client, () => true, {
    getOrigin: () => 'https://campus.example', isGoogleEnabled: async () => false,
  }).signInWithGoogle(), { code: 'FORBIDDEN' });
  for (const origin of ['http://campus.example', null, 'javascript:alert(1)']) {
    await assert.rejects(fixture('student', origin).service.signInWithGoogle(), { code: 'INVALID_INPUT' });
  }
  assert.equal(f.calls.length, 0);
});
test('OAuth startup errors and missing URLs become safe errors', async () => {
  const f = fixture();
  for (const response of [{ error: { message: 'private provider configuration' } }, { data: {} }]) {
    f.client.auth.signInWithOAuth = async () => response;
    await assert.rejects(f.service.signInWithGoogle(), e => e.code === 'UNAUTHORIZED' && !e.message.includes('private'));
  }
});
test('Google callback verifies the Auth user and uses only backend profile roles', async () => {
  for (const role of ['student', 'placement_incharge']) {
    const f = fixture(role);
    const result = await f.service.completeGoogleSignIn('single-use-code');
    assert.equal(result.role, role);
    assert.deepEqual(f.calls, [['exchange', 'single-use-code']]);
    assert.equal(f.signOuts, 0);
  }
});
test('missing/unsupported CampusOS profiles sign out instead of creating or trusting a role', async () => {
  for (const role of [null, 'admin']) {
    const f = fixture(role);
    await assert.rejects(f.service.completeGoogleSignIn('code'), { code: 'FORBIDDEN' });
    assert.equal(f.signOuts, 1);
  }
});
test('a Google callback with a mismatched verified user is rejected and signed out', async () => {
  const f = fixture();
  f.client.auth.getUser = async () => ({ data: { user: { id: 'different-user' } } });
  await assert.rejects(f.service.completeGoogleSignIn('code'), { code: 'UNAUTHORIZED' });
  assert.equal(f.signOuts, 1);
});
test('missing/expired authorization codes fail without exposing provider details', async () => {
  const f = fixture();
  for (const code of [null, '', ' ']) await assert.rejects(f.service.completeGoogleSignIn(code), { code: 'INVALID_INPUT' });
  assert.equal(f.calls.length, 0);
  f.client.auth.exchangeCodeForSession = async () => ({ error: { message: 'private token exchange detail' } });
  await assert.rejects(f.service.completeGoogleSignIn('expired'), e => e.code === 'UNAUTHORIZED' && !e.message.includes('private'));
});
test('post-login destinations stay on-site and within the verified role area', () => {
  assert.equal(getAuthRedirectPath('student', '/student/offers?tab=accepted#latest'), '/student/offers?tab=accepted#latest');
  assert.equal(getAuthRedirectPath('placement_incharge', '/incharge/students'), '/incharge/students');
  for (const path of ['https://attacker.test', '//attacker.test', '/\\attacker.test', '/student/../incharge/students',
    '/student/%2e%2e/incharge/students', '/incharge/students', '/studentish/test', 'javascript:alert(1)', '/student/\n/offers']) {
    assert.equal(getAuthRedirectPath('student', path), '/student/dashboard', path);
  }
  assert.equal(getAuthRedirectPath('admin', '/incharge/students'), '/unauthorized');
});
