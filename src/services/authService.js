import { getSupabase, isSupabaseConfigured } from '../lib/supabaseClient';

/**
 * Auth service abstraction over Supabase Auth.
 *
 * Owner split (agreed in S0 / docs/INTEGRATION_NOTES.md):
 *  - Member 1 owns the sign-in/session boundary used by src/hooks/useAuth.jsx:
 *    getSession, signInWithPassword, signOut, onAuthStateChange.
 *  - Member 2 owns the persistence/role helpers over the same client:
 *    fetchProfile, getCurrentUser, getCurrentProfile, isPlacementIncharge,
 *    getStudentRecord.
 * Both halves read one shared contract:
 *  - Roles live in public.profiles(id, role) where role is 'placement_incharge'
 *    or 'student' (matches src/features/data/contracts.js USER_ROLES).
 *  - profiles.id references auth.users.id.
 *  - Authorization is enforced by Supabase RLS, never by this module.
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
 * Fetch a profile row by auth user id (role source of truth).
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

/**
 * Verified signed-in auth user, or null. Server-validated (not a cached token).
 * @returns {Promise<import('@supabase/supabase-js').User|null>}
 */
export async function getCurrentUser() {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    // No active session is a normal state, not a failure.
    if (error.name === 'AuthSessionMissingError') return null;
    throw normalizeError(error, 'Could not read the current user.');
  }
  return data.user ?? null;
}

/**
 * Profile of the currently signed-in user, or null when signed out/unprovisioned.
 * @returns {Promise<{id:string, role:string}|null>}
 */
export async function getCurrentProfile() {
  const user = await getCurrentUser();
  if (!user) return null;
  return fetchProfile(user.id);
}

/**
 * Role gate for placement in-charge. UI convenience only — RLS still decides.
 * @returns {Promise<boolean>}
 */
export async function isPlacementIncharge() {
  const profile = await getCurrentProfile();
  return profile?.role === 'placement_incharge';
}

/**
 * Persistence row linking the signed-in auth user to a student record.
 * Returns null when the account has no student record (unprovisioned).
 * @returns {Promise<object|null>}
 */
export async function getStudentRecord() {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('students')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw normalizeError(error, 'Could not load your student record.');
  return data ?? null;
}
