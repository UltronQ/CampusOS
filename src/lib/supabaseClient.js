import { createClient } from '@supabase/supabase-js';

/**
 * Central Supabase browser client.
 * Uses only public project values (URL + anon key) injected by Vite.
 * The service-role key must never appear in frontend code or env files.
 * Authorization is enforced by Supabase RLS / trusted backend functions,
 * never by this client or by UI logic.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

let client = null;

export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function getSupabase() {
  if (!isSupabaseConfigured()) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY ' +
        '(see .env.local, copied from .env.example) and restart the dev server.',
    );
  }
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return client;
}
