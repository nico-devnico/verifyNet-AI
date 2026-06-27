import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '../lib/supabase';

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
      
      // Load profile from database
      loadProfile: async () => {
        const { user } = get();
        if (!user) return;
        
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();
          
          if (!error && data) {
            set({ profile: data });
          }
        } catch (err) {
          console.error('Error loading profile:', err);
        }
      },
      
      signOut: async () => {
        await supabase.auth.signOut();
        set({ user: null, session: null, profile: null });
      },

      // Check if user is admin or super admin
      isAdmin: () => {
        const { profile } = get();
        return profile?.role === 'admin' || profile?.role === 'super_admin';
      },
      
      // Check if user is super admin
      isSuperAdmin: () => {
        const { profile } = get();
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
