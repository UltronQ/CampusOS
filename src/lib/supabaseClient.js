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
    client = createClient(config.url, config.key);
  }
  return client;
}
