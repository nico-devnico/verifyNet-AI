import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import { logAuthAction } from '../utils/authErrors';

const useStore = create(
  persist(
    (set, get) => ({
      // Theme
      theme: 'light',
      toggleTheme: () => set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),

      // Auth
      user: null,
      session: null,
      profile: null,
      setUser: (user) => set({ user }),
      setSession: (session) => set({ session }),
      setProfile: (profile) => set({ profile }),
      
      // Load profile from database (with fallback creation if trigger fails)
      loadProfile: async () => {
        const { user } = get();
        if (!user) {
          console.log('⚠️ [Store] No user, skipping profile load');
          return;
        }
        
        console.log('📥 [Store] Loading profile for user:', user.id);
        
        try {
          // First try to load existing profile
          let { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();
          
          if (error || !data) {
            console.log('⚠️ [Store] Profile not found, trying to create it (fallback)...');
            
            // Fallback: create profile manually
            const { data: newProfile, error: createError } = await supabase
              .from('profiles')
              .insert({
                id: user.id,
                email: user.email,
                role: user.email === 'nicodevnico@gmail.com' ? 'super_admin' : 'user',
                is_verified: user.email === 'nicodevnico@gmail.com'
              })
              .select('*')
              .single();
            
            if (createError) {
              console.error('❌ [Store] Failed to create fallback profile:', createError);
              return;
            }
            
            data = newProfile;
            console.log('✅ [Store] Fallback profile created successfully:', data);
          }
          
          if (data) {
            console.log('✅ [Store] Profile loaded successfully:', data);
            set({ profile: data });
          }
        } catch (err) {
          console.error('❌ [Store] Exception loading profile:', err);
        }
      },
      
      signOut: async () => {
        logAuthAction('Déconnexion demandée');
        try {
          await supabase.auth.signOut();
          logAuthAction('Déconnexion réussie');
          set({ user: null, session: null, profile: null });
        } catch (err) {
          logAuthAction('Erreur lors de la déconnexion', { error: err.message });
          // Still clear state even if signOut fails
          set({ user: null, session: null, profile: null });
        }
      },

      // Check if user is admin or super admin
      isAdmin: () => {
        const { profile, user } = get();
        // Fallback: vérifier l'email si le profil n'est pas chargé
        if (user?.email === 'nicodevnico@gmail.com') return true;
        return profile?.role === 'admin' || profile?.role === 'super_admin';
      },
      
      // Check if user is super admin
      isSuperAdmin: () => {
        const { profile, user } = get();
        // Fallback: vérifier l'email si le profil n'est pas chargé
        if (user?.email === 'nicodevnico@gmail.com') return true;
        return profile?.role === 'super_admin';
      },

      // History
      history: [],
      addAnalysis: (analysis, fullData) =>
        set((s) => ({
          history: [
            { ...analysis, id: Date.now().toString(), date: new Date().toISOString(), fullData },
            ...s.history,
          ].slice(0, 100),
        })),
      clearHistory: () => set({ history: [] }),
      removeAnalysis: (id) =>
        set((s) => ({ history: s.history.filter((a) => a.id !== id) })),
      selectAnalysisFromHistory: (id) => {
        const analysis = get().history.find((a) => a.id === id);
        if (analysis && analysis.fullData) {
          set({ 
            currentAnalysis: analysis.fullData,
            isAnalyzing: false,
            analysisProgress: 100
          });
          return true;
        }
        return false;
      },

      // Current analysis
      currentAnalysis: null,
      setCurrentAnalysis: (analysis) => set({ currentAnalysis: analysis }),
      isAnalyzing: false,
      setIsAnalyzing: (v) => set({ isAnalyzing: v }),
      analysisProgress: 0,
      setAnalysisProgress: (v) => set({ analysisProgress: v }),
      analysisStep: '',
      setAnalysisStep: (v) => set({ analysisStep: v }),
    }),
    { name: 'verifynet-storage', partialize: (s) => ({ theme: s.theme, history: s.history }) }
  )
);

export default useStore;
