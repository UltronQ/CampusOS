import { getSupabase, isSupabaseConfigured } from '../lib/supabaseClient.js';
import { createAuthSessionService } from './authSessionService.js';

// Member 1's names remain stable; production uses real Supabase Auth.
const service = createAuthSessionService(getSupabase, isSupabaseConfigured);
export const {
  fetchProfile, getSession, signInWithPassword, signOut, onAuthStateChange,
  getCurrentUser, getCurrentProfile, isPlacementIncharge, getStudentRecord, getRoleSession,
} = service;
