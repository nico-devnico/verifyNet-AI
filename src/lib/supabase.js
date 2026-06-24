import { createClient } from '@supabase/supabase-js';

// These are placeholders - user needs to add their actual Supabase credentials!
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://example-project.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'dummy-key';

// Only create the client if the URL is valid (or just use a dummy one to prevent errors)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: true
  }
});
