import { createClient } from '@supabase/supabase-js';
import { readSupabaseConfig } from './supabaseConfig.js';

/**
 * Central Supabase browser client.
 * Uses only public project values (URL + anon key) injected by Vite.
 * The service-role key must never appear in frontend code or env files.
 * Authorization is enforced by Supabase RLS / trusted backend functions,
 * never by this client or by UI logic.
 */

const config = readSupabaseConfig(import.meta.env);

let client = null;

export function isSupabaseConfigured() {
  return config.configured;
}

export function getSupabase() {
  if (!isSupabaseConfigured()) {
    throw new Error(config.message);
  }
  if (!client) {
    client = createClient(config.url, config.key, {
      auth: { flowType: 'pkce', detectSessionInUrl: false },
    });
  }
  return client;
}

/** Public provider settings let the UI report disabled Google sign-in before redirecting. */
export async function isGoogleAuthEnabled() {
  if (!config.configured) throw new Error(config.message);
  try {
    const response = await fetch(`${config.url.replace(/\/$/, '')}/auth/v1/settings`, {
      headers: { apikey: config.key },
    });
    if (!response.ok) throw new Error('Auth settings unavailable');
    const settings = await response.json();
    return settings.external?.google === true;
  } catch {
    throw new Error('Could not check Google sign-in. Try again or use email and password.');
  }
}
