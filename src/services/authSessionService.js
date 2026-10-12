import { DataServiceError, toServiceError } from './serviceError.js';

const ROLES = new Set(['placement_incharge', 'student']);

/** Keep a late profile response from restoring a previous user's role. */
export function createRoleSessionResolver(service, publish) {
  let revision = 0;
  let stopped = false;
  return {
    async resolve(session, suppliedProfile) {
      const current = ++revision;
      if (stopped) return;
      publish({ session, profile: null, loading: Boolean(session), error: null });
      if (!session) return;
      try {
        const profile = suppliedProfile === undefined ? await service.fetchProfile(session.user.id) : suppliedProfile;
        if (!stopped && current === revision) publish({ session, profile, loading: false, error: null });
      } catch (error) {
        if (!stopped && current === revision) publish({ session, profile: null, loading: false, error });
      }
    },
    stop() { stopped = true; revision++; },
  };
}

/** Production supplies the real Supabase client; injection enables isolated tests. */
export function createAuthSessionService(getClient, configured = () => true) {
  async function fetchProfile(userId) {
    const { data, error } = await getClient().from('profiles').select('id, role').eq('id', userId).maybeSingle();
    if (error) throw toServiceError(error, 'Could not load your profile.');
    if (data && !ROLES.has(data.role)) throw new DataServiceError('FORBIDDEN', 'The account has an unsupported role.');
    return data ?? null;
  }
  async function getCurrentUser() {
    const { data, error } = await getClient().auth.getUser();
    if (error?.name === 'AuthSessionMissingError') return null;
    if (error) throw new DataServiceError('UNAUTHORIZED', 'Your session could not be verified. Sign in again.');
    return data?.user ?? null;
  }
  async function getSession() {
    const { data, error } = await getClient().auth.getSession();
    if (error) throw new DataServiceError('UNAUTHORIZED', 'Could not restore your session.');
    const session = data?.session ?? null;
    if (!session) return null;
    const user = await getCurrentUser();
    if (!user || user.id !== session.user.id) throw new DataServiceError('UNAUTHORIZED', 'The saved session does not match the verified user.');
    return session;
  }
  async function signOut() {
    const { error } = await getClient().auth.signOut();
    if (error) throw new DataServiceError('UNAUTHORIZED', 'Sign-out failed. Please try again.');
  }
  async function signInWithPassword(email, password) {
    if (!configured()) throw new DataServiceError('INVALID_INPUT', 'Supabase is not configured.');
    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) throw new DataServiceError('INVALID_INPUT', 'Email and password are required.');
    const { data, error } = await getClient().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error || !data?.session) throw new DataServiceError('UNAUTHORIZED', 'Sign-in failed. Check your credentials.');
    try {
      const profile = await fetchProfile(data.session.user.id);
      if (!profile) throw new DataServiceError('FORBIDDEN', 'Your account has no CampusOS role. Contact the Placement In-Charge.');
      return { session: data.session, profile, role: profile.role };
    } catch (failure) {
      await signOut();
      throw failure;
    }
  }
  async function getCurrentProfile() {
    const user = await getCurrentUser();
    return user ? fetchProfile(user.id) : null;
  }
  async function getStudentRecord() {
    const user = await getCurrentUser();
    if (!user) return null;
    const { data, error } = await getClient().from('students').select('*, department:departments(id, code, name)').eq('user_id', user.id).maybeSingle();
    if (error) throw toServiceError(error, 'Could not load your student record.');
    return data ?? null;
  }
  async function getRoleSession() {
    const session = await getSession();
    if (!session) return { session: null, profile: null, role: null, student: null };
    const profile = await fetchProfile(session.user.id);
    if (!profile) throw new DataServiceError('FORBIDDEN', 'Your account has no CampusOS role.');
    return { session, profile, role: profile.role, student: profile.role === 'student' ? await getStudentRecord() : null };
  }
  function onAuthStateChange(callback) {
    let active = true;
    const timers = new Set();
    const { data } = getClient().auth.onAuthStateChange((_event, session) => {
      // Defer work outside Supabase's auth callback/lock.
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (active) callback(session ?? null);
      }, 0);
      timers.add(timer);
    });
    return () => {
      active = false;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      data.subscription.unsubscribe();
    };
  }
  return { fetchProfile, getSession, signInWithPassword, signOut, onAuthStateChange,
    getCurrentUser, getCurrentProfile, getStudentRecord, getRoleSession,
    isPlacementIncharge: async () => (await getCurrentProfile())?.role === 'placement_incharge' };
}
