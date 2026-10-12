import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

// Only synthetic Auth responses. No real Google accounts, keys or traffic.
process.env.VITE_SUPABASE_URL = 'https://oauth-test.supabase.co';
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_only';
const root = fileURLToPath(new URL('../../../', import.meta.url));
let server;
let browser;
try {
  server = await createServer({ root, server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  const channel = process.env.PLAYWRIGHT_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined);
  browser = await chromium.launch({ headless: true, ...(channel ? { channel } : {}) });

  async function scenario(mode, run) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    const state = { authorizations: 0, exchanges: 0, logouts: 0, challenge: null };
    page.on('pageerror', error => errors.push(error.message));
    const user = { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', aud: 'authenticated', role: 'authenticated',
      email: 'student@example.test', app_metadata: { provider: 'google', providers: ['google'] },
      user_metadata: { role: 'placement_incharge' } };
    const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.test-only-signature`;
    await page.route('https://oauth-test.supabase.co/**', async route => {
      const request = route.request();
      const url = new URL(request.url());
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      if (url.pathname === '/auth/v1/authorize') {
        state.authorizations++;
        assert.equal(url.searchParams.get('provider'), 'google');
        assert.equal(url.searchParams.get('redirect_to'), `${origin}/auth/callback`);
        assert.equal(url.searchParams.get('code_challenge_method').toLowerCase(), 's256');
        state.challenge = url.searchParams.get('code_challenge');
        return route.fulfill({ status: 302, headers: { location: `${origin}/auth/callback?code=test-one-use-code` } });
      }
      if (url.pathname === '/auth/v1/token') {
        state.exchanges++;
        assert.equal(url.searchParams.get('grant_type'), 'pkce');
        const payload = request.postDataJSON();
        assert.equal(payload.auth_code, 'test-one-use-code');
        assert.equal(createHash('sha256').update(payload.code_verifier).digest('base64url'), state.challenge);
        if (mode === 'expired') return route.fulfill({ status: 400, headers: cors, json: { error: 'invalid_grant', error_description: 'private token exchange detail' } });
        return route.fulfill({ status: 200, headers: cors, json: { access_token: token, refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600, user } });
      }
      if (url.pathname === '/auth/v1/settings') return route.fulfill({ status: 200, headers: cors, json: { external: { google: mode !== 'disabled', email: true } } });
      if (url.pathname === '/auth/v1/user') return route.fulfill({ status: 200, headers: cors, json: user });
      if (url.pathname === '/auth/v1/logout') {
        state.logouts++;
        return route.fulfill({ status: 200, headers: cors, json: {} });
      }
      if (url.pathname === '/rest/v1/profiles') return route.fulfill({ status: 200, headers: cors,
        json: mode === 'unprovisioned' ? [] : [{ id: user.id, role: 'student' }] });
      if (url.pathname === '/rest/v1/students') return route.fulfill({ status: 200, headers: cors,
        json: [{ id: '00000000-0000-0000-0000-000000000001', user_id: user.id, full_name: 'Test Student', department_id: '11111111-1111-1111-1111-111111111111', graduation_year: 2027 }] });
      if (url.pathname.startsWith('/rest/v1/')) return route.fulfill({ status: 200, headers: cors, json: [] });
      throw new Error(`Unexpected Auth request: ${url.pathname}`);
    });
    try {
      await run(page, state, origin);
      assert.deepEqual(errors, []);
      console.log(`PASS Google browser scenario: ${mode}`);
    } finally { await context.close(); }
  }

  await scenario('success', async (page, state, origin) => {
    await page.goto(`${origin}/student/offers`);
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    await page.waitForURL(`${origin}/student/offers`);
    assert.equal(state.authorizations, 1);
    assert.equal(state.exchanges, 1, 'StrictMode must not exchange the single-use code twice');
    assert.equal(state.logouts, 0);
    assert.ok(!page.url().includes('code='));
  });
  await scenario('disabled', async (page, state, origin) => {
    await page.goto(`${origin}/signin`);
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    await page.getByText(/Google sign-in is not enabled for CampusOS yet/).waitFor();
    assert.equal(state.authorizations, 0);
    assert.equal(state.exchanges, 0);
    assert.equal(page.url(), `${origin}/signin`);
  });
  for (const mode of ['expired', 'unprovisioned']) await scenario(mode, async (page, state, origin) => {
    await page.goto(`${origin}/signin`);
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    await page.getByRole('heading', { name: 'Google sign-in failed' }).waitFor();
    await page.waitForURL(`${origin}/auth/callback`);
    assert.equal(state.exchanges, 1);
    if (mode === 'unprovisioned') assert.ok(state.logouts >= 1);
    assert.ok(!(await page.textContent('body')).includes('private token exchange detail'));
    await page.getByRole('button', { name: 'Return to sign in' }).click();
    await page.waitForURL(`${origin}/signin`);
  });
  await scenario('cancelled', async (page, state, origin) => {
    await page.goto(`${origin}/auth/callback?error=access_denied&error_description=private-provider-detail`);
    await page.getByText('Google sign-in was cancelled or denied. Please try again.').waitFor();
    assert.equal(state.exchanges, 0);
    assert.ok(!(await page.textContent('body')).includes('private-provider-detail'));
  });
  await scenario('missing-code', async (page, state, origin) => {
    await page.goto(`${origin}/auth/callback`);
    await page.getByText(/This sign-in link is incomplete/).waitFor();
    assert.equal(state.exchanges, 0);
  });
} finally {
  await browser?.close();
  await server?.close();
}
