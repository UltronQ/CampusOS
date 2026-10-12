import { getSupabase, isSupabaseConfigured, isGoogleAuthEnabled } from '../lib/supabaseClient.js';
import { createAuthSessionService } from './authSessionService.js';

// Member 1's names remain stable; production uses real Supabase Auth.
const service = createAuthSessionService(getSupabase, isSupabaseConfigured, { isGoogleEnabled: isGoogleAuthEnabled });
export const {
  fetchProfile, getSession, signInWithPassword, signInWithGoogle, completeGoogleSignIn, signOut, onAuthStateChange,
  getCurrentUser, getCurrentProfile, isPlacementIncharge, getStudentRecord, getRoleSession,
} = service;
