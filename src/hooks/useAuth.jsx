import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import * as authService from '../services/authService';
import { isSupabaseConfigured } from '../lib/supabaseClient';

/**
 * Centralized authentication state for the whole app.
 * The role shown here comes from the backend profiles table; the UI uses it
 * only to choose navigation and routes. Real authorization is enforced by
 * Supabase RLS on every query — hiding a button is not a permission.
 */

const AuthContext = createContext(null);

/**
 * @typedef {Object} AuthState
 * @property {import('@supabase/supabase-js').Session|null} session
 * @property {import('@supabase/supabase-js').User|null} user
 * @property {{id:string, role:string}|null} profile Backend role source of truth.
 * @property {string|null} role Convenience alias of profile.role.
 * @property {boolean} loading True only during initial session resolution.
 * @property {Error|null} error Fatal config/bootstrap error (e.g. missing env).
 * @property {(email:string, password:string) => Promise<{session:any, profile:any}>} signIn
 * @property {() => Promise<void>} signOut
 * @property {() => Promise<void>} refreshProfile Re-read profiles row.
 * @property {boolean} isPlacementIncharge
 * @property {boolean} isStudent
 */

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadProfileFor = useCallback(async (user) => {
    if (!user) {
      setProfile(null);
      return null;
    }
    const nextProfile = await authService.fetchProfile(user.id);
    setProfile(nextProfile);
    return nextProfile;
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setError(
        new Error(
          'Supabase is not configured. Copy .env.example to .env.local and set ' +
            'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart the dev server.',
        ),
      );
      setLoading(false);
      return undefined;
    }

    let cancelled = false;

    (async () => {
      try {
        const initial = await authService.getSession();
        if (cancelled) return;
        setSession(initial);
        await loadProfileFor(initial?.user ?? null);
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const unsubscribe = authService.onAuthStateChange(async (nextSession) => {
      setSession(nextSession);
      try {
        await loadProfileFor(nextSession?.user ?? null);
      } catch (err) {
        setError(err);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [loadProfileFor]);

  const signIn = useCallback(
    async (email, password) => {
      const result = await authService.signInWithPassword(email, password);
      setSession(result.session);
      setProfile(result.profile);
      return result;
    },
    [],
  );

  const signOut = useCallback(async () => {
    await authService.signOut();
    setSession(null);
    setProfile(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    await loadProfileFor(session?.user ?? null);
  }, [loadProfileFor, session]);

  const value = useMemo(() => {
    const role = profile?.role ?? null;
    return {
      session,
      user: session?.user ?? null,
      profile,
      role,
      loading,
      error,
      signIn,
      signOut,
      refreshProfile,
      isPlacementIncharge: role === 'placement_incharge',
      isStudent: role === 'student',
    };
  }, [session, profile, loading, error, signIn, signOut, refreshProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * @returns {AuthState}
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>.');
  return ctx;
}
