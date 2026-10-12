const missingSettings = 'Supabase is not configured. Set your real VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY) in .env.local, then restart the dev server.';

/** Validate local browser settings without echoing a key or making network calls. */
export function readSupabaseConfig(env = {}) {
  const url = String(env.VITE_SUPABASE_URL ?? '').trim();
  const key = String(env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (!url || !key || /your-project(?:-ref)?|your-supabase|<|>/i.test(url)
    || /^(your-anon-key|your-publishable-key|your-publishable-key-or-anon-key)$/i.test(key)) {
    return { url, key, configured: false, message: missingSettings };
  }
  try {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol) || !parsed.hostname) throw new Error('Invalid URL');
  } catch {
    return { url, key, configured: false, message: 'VITE_SUPABASE_URL must be the Project URL from your Supabase project’s Connect dialog.' };
  }
  let privileged = key.startsWith('sb_secret_');
  if (key.split('.').length === 3) {
    try {
      const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      privileged ||= payload.role === 'service_role';
    } catch { /* Key authenticity is verified by Supabase, not by this browser. */ }
  }
  if (privileged) return { url, key, configured: false, message: 'Use the Supabase browser publishable or anon key; secret and service-role keys cannot be used in this app.' };
  return { url, key, configured: true, message: null };
}
