import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Validate configuration
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ [Supabase] Configuration manquante !');
  console.error('📋 VITE_SUPABASE_URL:', supabaseUrl ? '✅ Présent' : '❌ Manquant');
  console.error('📋 VITE_SUPABASE_ANON_KEY:', supabaseAnonKey ? '✅ Présent' : '❌ Manquant');
  throw new Error('La configuration Supabase est incomplète. Vérifiez les variables d\'environnement.');
}

console.log('✅ [Supabase] Configuration chargée');
console.log('🌐 URL:', supabaseUrl);
console.log('🔑 Clé publique:', supabaseAnonKey.substring(0, 20) + '...');

// Create Supabase client with proper auth settings
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce'
  }
});

// Health check function
export const checkSupabaseHealth = async () => {
  try {
    console.log('🔍 [Supabase] Vérification de la connexion...');
    // Simple health check by fetching the current session (works even if not logged in)
    const { error } = await supabase.auth.getSession();
    
    if (error) {
      console.error('❌ [Supabase] Échec de la vérification de santé:', error);
      return { success: false, error };
    }
    
    console.log('✅ [Supabase] Connexion établie avec succès !');
    return { success: true };
  } catch (err) {
    console.error('❌ [Supabase] Erreur de connexion:', err);
    return { success: false, error: err };
  }
};
