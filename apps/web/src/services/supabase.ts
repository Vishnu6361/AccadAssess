import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/**
 * Shared Supabase Client
 * Note: Only publishable / anon key is used here. Service role keys MUST NEVER be imported on client.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export const getSupabaseClient = (): SupabaseClient => {
  if (!supabase) {
    throw new Error(
      'Supabase client is not configured. Please supply VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.'
    );
  }
  return supabase;
};
