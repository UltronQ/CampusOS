/**
 * Supabase client - client-side for app; server contexts should use service role only if needed,
 * but per project rules never expose service-role keys or secrets. 
 */
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '')
