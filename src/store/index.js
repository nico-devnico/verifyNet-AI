import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import { logAuthAction } from '../utils/authErrors';

/**
 * Email du super admin racine. Sert uniquement à afficher l'interface
 * d'administration quand le profil n'a pas encore été chargé : toute action
 * réelle est autorisée côté base (fonctions RPC) et côté API, jamais ici.
 */
const ROOT_SUPER_ADMIN = (import.meta.env.VITE_SUPER_ADMIN_EMAIL || '').toLowerCase();

const TRUTHY = new Set(['true', 't', '1', 'yes', 'on']);

/** Réglages de repli si la table system_settings n'est pas encore accessible. */
const DEFAULT_SETTINGS = {
  app_name: 'VerifyNet',
  app_tagline: "Vérifiez l'information avant de la partager",
  maintenance_mode: 'false',
  maintenance_message: 'VerifyNet est en maintenance. Nous revenons très vite.',
  enable_registrations: 'true',
  allow_anonymous_analysis: 'true',
  max_analyses_per_day: '100',
  max_anonymous_per_day: '5',
  max_upload_size_mb: '15',
  max_text_length: '20000',
  enable_image_analysis: 'true',
  enable_document_analysis: 'true',
  enable_public_sharing: 'true',
  enable_pdf_export: 'true',
  enable_file_archiving: 'true',
  log_anonymous_analyses: 'true',
};

const useStore = create(
  persist(
    (set, get) => ({
      /* ------------------------------------------------------------------ */
      /* Apparence                                                          */
      /* ------------------------------------------------------------------ */
      theme: 'light',
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),

      /* ------------------------------------------------------------------ */
      /* Authentification                                                    */
      /* ------------------------------------------------------------------ */
      user: null,
      session: null,
      profile: null,
      profileError: null,

      setUser: (user) => set({ user }),
      setSession: (session) => set({ session }),
      setProfile: (profile) => set({ profile }),

      /**
       * Charge le profil. Le trigger `handle_new_user` le crée normalement à
       * l'inscription ; le repli ci-dessous couvre les comptes créés avant la
       * mise en place du trigger.
       */
      loadProfile: async () => {
        const { user } = get();
        if (!user) return null;

        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        if (data) {
          set({ profile: data, profileError: null });
          return data;
        }

        if (error) {
          console.warn('[Store] Lecture du profil impossible :', error.message);
          set({ profileError: error.message });
          return null;
        }

        // Profil absent : on le crée. Le rôle est imposé par le trigger
        // `guard_profile_insert`, un utilisateur ne peut donc pas s'auto-promouvoir.
        const { data: created, error: createError } = await supabase
          .from('profiles')
          .insert({ id: user.id, email: user.email })
          .select()
          .single();

        if (createError) {
          console.warn('[Store] Création du profil impossible :', createError.message);
          set({ profileError: createError.message });
          return null;
        }
        set({ profile: created, profileError: null });
        return created;
      },

      updateProfile: async (patch) => {
        const { user } = get();
        if (!user) throw new Error('Non authentifié.');

        const { data, error } = await supabase
          .from('profiles')
          .update(patch)
          .eq('id', user.id)
          .select()
          .single();

        if (error) throw error;
        set({ profile: data });
        return data;
      },

      signOut: async () => {
        logAuthAction('Déconnexion demandée');
        try {
          await supabase.auth.signOut();
        } catch (err) {
          logAuthAction('Erreur de déconnexion', { error: err.message });
        }
        set({
          user: null,
          session: null,
          profile: null,
          notifications: [],
          usage: null,
          currentAnalysis: null,
        });
      },

      isAdmin: () => {
        const { profile, user } = get();
        if (profile) return ['admin', 'super_admin'].includes(profile.role);
        return Boolean(ROOT_SUPER_ADMIN && user?.email?.toLowerCase() === ROOT_SUPER_ADMIN);
      },

      isSuperAdmin: () => {
        const { profile, user } = get();
        if (profile) return profile.role === 'super_admin';
        return Boolean(ROOT_SUPER_ADMIN && user?.email?.toLowerCase() === ROOT_SUPER_ADMIN);
      },

      isSuspended: () => Boolean(get().profile?.is_suspended),

      /* ------------------------------------------------------------------ */
      /* Réglages pilotés par le super admin                                 */
      /* ------------------------------------------------------------------ */
      settings: DEFAULT_SETTINGS,
      settingsLoaded: false,

      /**
       * Lit les réglages publics. La politique RLS `is_public` autorise la
       * lecture anonyme : c'est indispensable pour que le mode maintenance et
       * la fermeture des inscriptions s'appliquent avant toute connexion.
       */
      loadSettings: async () => {
        try {
          const { data, error } = await supabase.from('system_settings').select('key, value');
          if (error) throw error;

          const next = { ...DEFAULT_SETTINGS };
          for (const row of data || []) next[row.key] = row.value;
          set({ settings: next, settingsLoaded: true });
          return next;
        } catch (err) {
          console.warn('[Store] Réglages indisponibles, valeurs par défaut :', err.message);
          set({ settingsLoaded: true });
          return get().settings;
        }
      },

      setting: (key, fallback = '') => get().settings[key] ?? fallback,

      settingBool: (key, fallback = false) => {
        const raw = get().settings[key];
        if (raw === undefined || raw === null || raw === '') return fallback;
        return TRUTHY.has(String(raw).toLowerCase());
      },

      settingNumber: (key, fallback = 0) => {
        const parsed = Number(get().settings[key]);
        return Number.isFinite(parsed) ? parsed : fallback;
      },

      /** Maintenance active ET utilisateur non administrateur. */
      isLockedByMaintenance: () => get().settingBool('maintenance_mode', false) && !get().isAdmin(),

      /* ------------------------------------------------------------------ */
      /* Notifications                                                       */
      /* ------------------------------------------------------------------ */
      notifications: [],

      loadNotifications: async () => {
        const { user } = get();
        if (!user) return [];

        const { data, error } = await supabase
          .from('notifications')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(30);

        if (error) {
          console.warn('[Store] Notifications indisponibles :', error.message);
          return [];
        }
        set({ notifications: data || [] });
        return data || [];
      },

      unreadCount: () => get().notifications.filter((n) => !n.is_read).length,

      markNotificationRead: async (id) => {
        set((s) => ({
          notifications: s.notifications.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
        }));
        await supabase.from('notifications').update({ is_read: true }).eq('id', id);
      },

      markAllNotificationsRead: async () => {
        set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, is_read: true })) }));
        await supabase.rpc('mark_all_notifications_read');
      },

      /* ------------------------------------------------------------------ */
      /* Quota                                                               */
      /* ------------------------------------------------------------------ */
      usage: null,

      loadUsage: async () => {
        const { user } = get();
        if (!user) return null;
        try {
          const { data, error } = await supabase.rpc('my_usage_today');
          if (error) throw error;
          set({ usage: data });
          return data;
        } catch (err) {
          console.warn('[Store] Quota indisponible :', err.message);
          return null;
        }
      },

      /* ------------------------------------------------------------------ */
      /* Historique local (visiteurs non connectés)                          */
      /* ------------------------------------------------------------------ */
      localHistory: [],

      addLocalAnalysis: (summary, fullData) =>
        set((s) => ({
          localHistory: [
            {
              ...summary,
              id: `local-${Date.now()}`,
              created_at: new Date().toISOString(),
              result: fullData,
            },
            ...s.localHistory,
          ].slice(0, 50),
        })),

      removeLocalAnalysis: (id) =>
        set((s) => ({ localHistory: s.localHistory.filter((a) => a.id !== id) })),

      clearLocalHistory: () => set({ localHistory: [] }),

      /* ------------------------------------------------------------------ */
      /* Analyse en cours                                                    */
      /* ------------------------------------------------------------------ */
      currentAnalysis: null,
      setCurrentAnalysis: (analysis) => set({ currentAnalysis: analysis }),

      isAnalyzing: false,
      setIsAnalyzing: (v) => set({ isAnalyzing: v }),

      analysisProgress: 0,
      setAnalysisProgress: (v) => set({ analysisProgress: v }),

      analysisStep: '',
      setAnalysisStep: (v) => set({ analysisStep: v }),
    }),
    {
      name: 'verifynet-storage',
      version: 2,
      partialize: (s) => ({ theme: s.theme, localHistory: s.localHistory }),
      // Récupère l'historique de l'ancien format pour ne rien perdre.
      migrate: (persisted, version) => {
        if (version < 2 && persisted?.history) {
          return {
            theme: persisted.theme ?? 'light',
            localHistory: persisted.history.map((h) => ({
              id: h.id,
              type: h.type,
              input: h.input,
              score: h.score,
              verdict: h.verdict,
              created_at: h.date,
              result: h.fullData,
            })),
          };
        }
        return persisted;
      },
    }
  )
);

export default useStore;
