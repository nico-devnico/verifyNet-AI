import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  BrowserRouter, Routes, Route, Navigate, useLocation,
} from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AlertTriangle, RefreshCw } from 'lucide-react';

import Layout from './components/layout/Layout';
import Toaster from './components/ui/Toaster';
import CommandPalette from './components/ui/CommandPalette';
import { MaintenanceScreen, SuspendedScreen } from './components/system/StatusScreen';
import useStore from './store';
import { supabase, checkSupabaseHealth } from './lib/supabase';
import './styles/global.css';

const Landing = lazy(() => import('./pages/Landing'));
const Analyze = lazy(() => import('./pages/Analyze'));
const History = lazy(() => import('./pages/History'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Settings = lazy(() => import('./pages/Settings'));
const About = lazy(() => import('./pages/About'));
const Login = lazy(() => import('./pages/Login'));
const Signup = lazy(() => import('./pages/Signup'));
const Admin = lazy(() => import('./pages/Admin'));
const SuperAdmin = lazy(() => import('./pages/SuperAdmin'));
const SharedReport = lazy(() => import('./pages/SharedReport'));

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

function Spinner({ size = 32, minHeight = '60vh', label }) {
  return (
    <div className="app-boot" style={{ minHeight }}>
      <div className="app-boot-spinner" style={{ width: size, height: size }} />
      {label && <p>{label}</p>}
    </div>
  );
}

function ProtectedRoute({ children, requireAdmin = false, requireSuperAdmin = false }) {
  const { user, isAdmin, isSuperAdmin } = useStore();
  const location = useLocation();

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (requireSuperAdmin && !isSuperAdmin()) return <Navigate to="/" replace />;
  if (requireAdmin && !isAdmin()) return <Navigate to="/" replace />;

  return children;
}

/** Remet la page en haut à chaque navigation. */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'auto' }); }, [pathname]);
  return null;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Rapport partagé : hors Layout, lisible sans compte. */}
      <Route path="/r/:slug" element={<SharedReport />} />

      <Route path="/" element={<Layout />}>
        <Route index element={<Landing />} />
        <Route path="login" element={<Login />} />
        <Route path="signup" element={<Signup />} />
        <Route path="about" element={<About />} />
        <Route path="analyze" element={<Analyze />} />

        <Route path="history" element={<ProtectedRoute><History /></ProtectedRoute>} />
        <Route path="dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route
          path="admin"
          element={<ProtectedRoute requireAdmin><Admin /></ProtectedRoute>}
        />
        <Route
          path="super-admin"
          element={<ProtectedRoute requireSuperAdmin><SuperAdmin /></ProtectedRoute>}
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function AppContent() {
  const {
    user, profile, profileError, setUser, setSession, loadProfile, loadSettings,
    loadNotifications, loadUsage, isSuspended, isLockedByMaintenance, settings,
  } = useStore();
  const location = useLocation();

  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState(null);
  const loadedForUser = useRef(null);

  /* Session + réglages publics. Les réglages sont lus avant l'affichage pour que
     le mode maintenance et la fermeture des inscriptions s'appliquent dès la
     première peinture, y compris pour un visiteur non connecté. */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const health = await checkSupabaseHealth();
        if (!health.success) {
          throw new Error(
            'Connexion à Supabase impossible. Vérifiez VITE_SUPABASE_URL et ' +
            'VITE_SUPABASE_ANON_KEY dans votre fichier .env, puis votre accès réseau.'
          );
        }

        const [{ data, error }] = await Promise.all([
          supabase.auth.getSession(),
          loadSettings(),
        ]);
        if (error) throw error;
        if (cancelled) return;

        setSession(data.session);
        setUser(data.session?.user ?? null);
      } catch (err) {
        if (!cancelled) setBootError(err.message);
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (event === 'SIGNED_OUT') loadedForUser.current = null;
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [setUser, setSession, loadSettings]);

  /* Profil, notifications et quota : une seule fois par utilisateur connecté. */
  useEffect(() => {
    if (!user || loadedForUser.current === user.id) return;
    loadedForUser.current = user.id;

    (async () => {
      await loadProfile();
      await Promise.all([loadNotifications(), loadUsage()]);
    })();
  }, [user, loadProfile, loadNotifications, loadUsage]);

  /* Un changement de rôle ou une notification doit se voir sans rechargement. */
  useEffect(() => {
    if (!user) return undefined;

    const channel = supabase
      .channel(`user-sync-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
        () => loadProfile()
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => loadNotifications()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, loadProfile, loadNotifications]);

  /* Réglages publics : slogan, maintenance, inscriptions. Abonnement global,
     sinon un visiteur (et un admin qui se reconnecte) ne verrait le changement
     qu'après un rechargement. */
  useEffect(() => {
    const channel = supabase
      .channel('platform-settings')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'system_settings' },
        () => loadSettings()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadSettings]);

  useEffect(() => {
    const name = settings.app_name || 'VerifyNet';
    const tagline = settings.app_tagline || '';
    document.title = tagline ? `${name} — ${tagline}` : name;
    const meta = document.querySelector('meta[name="description"]');
    if (meta && tagline) meta.setAttribute('content', tagline);
  }, [settings.app_name, settings.app_tagline]);

  if (booting) {
    return <Spinner size={46} minHeight="100vh" label="Initialisation de VerifyNet…" />;
  }

  if (bootError) {
    return (
      <div className="app-boot app-boot-error" style={{ minHeight: '100vh' }}>
        <span className="app-boot-icon"><AlertTriangle size={30} /></span>
        <h1>Connexion impossible</h1>
        <p>{bootError}</p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>
          <RefreshCw size={16} /> Réessayer
        </button>
      </div>
    );
  }

  /* Le profil est nécessaire pour trancher entre « suspendu » et « actif » :
     sans lui on afficherait brièvement l'application à un compte suspendu.
     En cas d'échec de lecture (migration non appliquée, RLS), on laisse passer :
     le serveur reste le garde-fou, et bloquer ici rendrait l'app inutilisable. */
  if (user && !profile && !profileError) {
    return <Spinner size={46} minHeight="100vh" label="Chargement de votre profil…" />;
  }

  if (isSuspended()) return <SuspendedScreen />;

  /*
   * La maintenance ne doit jamais masquer /login : c'est le seul moyen pour un
   * administrateur déconnecté de revenir désactiver le mode. Les autres
   * visiteurs voient l'écran plein cadre, avec un lien vers la connexion.
   */
  const onLogin = location.pathname === '/login';
  if (isLockedByMaintenance() && !onLogin) return <MaintenanceScreen />;

  return <AppRoutes />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ScrollToTop />
        <Suspense fallback={<Spinner />}>
          <AppContent />
        </Suspense>
        <Toaster />
        <CommandPalette />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
