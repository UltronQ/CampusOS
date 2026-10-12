import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as authService from '../services/authService';
import { createRoleSessionResolver } from '../services/authSessionService';
import { isSupabaseConfigured } from '../lib/supabaseClient';

const AuthContext = createContext(null);

// Backend profiles supply exactly two roles. This state controls navigation;
// RLS/trusted database functions remain the authority for every operation.
export function AuthProvider({ children }) {
  const [state, setState] = useState({ session: null, profile: null, loading: true, error: null });
  const resolverRef = useRef(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setState({ session: null, profile: null, loading: false, error: new Error(
        'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
      ) });
      return undefined;
    }
    let active = true;
    let receivedEvent = false;
    const resolver = createRoleSessionResolver(authService, (next) => { if (active) setState(next); });
    resolverRef.current = resolver;
    const unsubscribe = authService.onAuthStateChange((session) => {
      receivedEvent = true;
      resolver.resolve(session);
    });
    authService.getSession().then(
      (session) => { if (active && !receivedEvent) resolver.resolve(session); },
      (error) => { if (active && !receivedEvent) setState({ session: null, profile: null, loading: false, error }); },
    );
    return () => {
      active = false;
      resolver.stop();
      unsubscribe();
      if (resolverRef.current === resolver) resolverRef.current = null;
    };
  }, []);

  const signIn = useCallback(async (email, password) => {
    const result = await authService.signInWithPassword(email, password);
    await resolverRef.current?.resolve(result.session, result.profile);
    return result;
  }, []);
  const signOut = useCallback(async () => {
    await authService.signOut();
    await resolverRef.current?.resolve(null);
  }, []);
  const refreshProfile = useCallback(async () => {
    await resolverRef.current?.resolve(state.session);
  }, [state.session]);
  const value = useMemo(() => {
    const role = state.profile?.role ?? null;
    return { ...state, user: state.session?.user ?? null, role, signIn, signOut, refreshProfile,
      isPlacementIncharge: role === 'placement_incharge', isStudent: role === 'student' };
  }, [state, signIn, signOut, refreshProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>.');
  return context;
}
