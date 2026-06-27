import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://lvqvlydzfcuhiyxpadsr.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2cXZseWR6ZmN1aGl5eHBhZHNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1Njg2MTIsImV4cCI6MjA5ODE0NDYxMn0.zPiF1cn_YuJ12lr2bJ6NsXVCBFuqZa1hf1julpe88-s';

// Create Supabase client with proper auth settings
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});
