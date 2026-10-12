import { getSupabase, isSupabaseConfigured } from '../lib/supabaseClient';

/**
 * Auth service abstraction (Member 1 boundary over Supabase Auth).
 * Integration contract with Member 2:
 *  - Roles live in public.profiles(id, role) where role is 'placement_incharge'
 *    or 'student' (matches src/features/data/contracts.js USER_ROLES).
 *  - profiles.id references auth.users.id.
 *  - Member 2 owns the schema/RLS; this module only reads the agreed shape.
 *  - All errors are rethrown with readable messages; nothing is swallowed.
 */

/**
 * @param {Error|null} error
 * @param {string} fallback
 * @returns {Error}
 */
function normalizeError(error, fallback) {
  if (error instanceof Error && error.message) return error;
  return new Error(fallback);
}

/**
 * Fetch the signed-in user's profile row (role source of truth).
 * Returns null when no profile row exists yet — callers must treat that as
 * "not provisioned", never as a default role.
 * @param {string} userId
 * @returns {Promise<{id:string, role:string}|null>}
 */
export async function fetchProfile(userId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw normalizeError(error, 'Could not load your profile.');
  return data ?? null;
}

/**
 * @returns {Promise<import('@supabase/supabase-js').Session|null>}
 */
export async function getSession() {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw normalizeError(error, 'Could not read the current session.');
  return data.session ?? null;
}

/**
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{session: import('@supabase/supabase-js').Session, profile:{id:string, role:string}|null}>}
 */
export async function signInWithPassword(email, password) {
  if (!isSupabaseConfigured()) throw new Error('Supabase is not configured.');
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw normalizeError(error, 'Sign-in failed.');
  if (!data.session) throw new Error('Sign-in failed: no session returned.');
  const profile = await fetchProfile(data.session.user.id);
  return { session: data.session, profile };
}

/**
 * @returns {Promise<void>}
 */
export async function signOut() {
  const supabase = getSupabase();
  const { error } = await supabase.auth.signOut();
  if (error) throw normalizeError(error, 'Sign-out failed.');
}

/**
 * Subscribe to Supabase auth events. Returns an unsubscribe function.
 * @param {(session: import('@supabase/supabase-js').Session|null) => void} callback
 * @returns {() => void}
 */
export function onAuthStateChange(callback) {
  const supabase = getSupabase();
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session ?? null);
  });
  return () => data.subscription.unsubscribe();
}
