import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSupabaseConfig } from '../lib/supabaseConfig.js';

const url = 'https://example-project.supabase.co';
test('missing settings and copied examples never count as configured', () => {
  for (const env of [{}, { VITE_SUPABASE_URL: url }, {
    VITE_SUPABASE_URL: 'https://your-project-ref.supabase.co', VITE_SUPABASE_ANON_KEY: 'your-anon-key',
  }, { VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: 'your-publishable-key' }]) {
    assert.equal(readSupabaseConfig(env).configured, false);
  }
});
test('publishable settings and existing anon settings are compatible', () => {
  const config = readSupabaseConfig({ VITE_SUPABASE_URL: ` ${url} `, VITE_SUPABASE_PUBLISHABLE_KEY: ' sb_publishable_example ', VITE_SUPABASE_ANON_KEY: 'legacy-key' });
  assert.equal(config.configured, true);
  assert.equal(config.url, url);
  assert.equal(config.key, 'sb_publishable_example');
  assert.equal(readSupabaseConfig({ VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: 'legacy-key' }).configured, true);
});
test('invalid URLs and privileged keys are rejected without exposing keys', () => {
  assert.equal(readSupabaseConfig({ VITE_SUPABASE_URL: 'invalid', VITE_SUPABASE_ANON_KEY: 'legacy-key' }).configured, false);
  const serviceKey = `header.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.signature`;
  for (const key of ['sb_secret_example', serviceKey]) {
    const config = readSupabaseConfig({ VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: key });
    assert.equal(config.configured, false);
    assert.ok(!config.message.includes(key));
  }
});
