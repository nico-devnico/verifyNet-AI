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
      setUser: (user) => set({ user }),
      setSession: (session) => set({ session }),
      signOut: async () => {
        await supabase.auth.signOut();
        set({ user: null, session: null });
      },

      // History
      history: [],
      addAnalysis: (analysis) =>
        set((s) => ({
          history: [
            { ...analysis, id: Date.now().toString(), date: new Date().toISOString() },
            ...s.history,
          ].slice(0, 100),
        })),
      clearHistory: () => set({ history: [] }),
      removeAnalysis: (id) =>
        set((s) => ({ history: s.history.filter((a) => a.id !== id) })),

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
