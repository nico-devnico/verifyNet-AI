import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from './components/layout/Layout';
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

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

function LoadingFallback() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{ width: 32, height: 32, border: '3px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
    </div>
  );
}

// Protected route wrapper
function ProtectedRoute({ children, requireAdmin = false }) {
  const { user, profile, isAdmin } = useStore();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requireAdmin && !isAdmin()) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function AppContent() {
  const { setUser, setSession, user, loadProfile, profile } = useStore();
  const [authLoading, setAuthLoading] = useState(true);
  const [supabaseError, setSupabaseError] = useState(null);

  useEffect(() => {
    console.log('🚀 [App] Démarrage de l\'initialisation...');

    const initApp = async () => {
      try {
        // 1. Vérifier la connexion Supabase
        console.log('🔍 [App] Étape 1: Vérification de la santé Supabase...');
        const health = await checkSupabaseHealth();
        if (!health.success) {
          throw new Error('Impossible de se connecter à Supabase. Vérifiez votre connexion internet et la configuration.');
        }

        // 2. Récupérer la session initiale
        console.log('📡 [App] Étape 2: Récupération de la session...');
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          console.error('❌ [App] Erreur getSession:', error);
          throw error;
        }

        console.log('✅ [App] Session récupérée:', data.session ? 'Utilisateur connecté' : 'Aucune session');
        setSession(data.session);
        setUser(data.session?.user ?? null);
      } catch (err) {
        console.error('❌ [App] Erreur d\'initialisation:', err);
        setSupabaseError(err.message);
      } finally {
        setAuthLoading(false);
      }
    };

    initApp();

    // Écouter les changements d'authentification
    console.log('👂 [App] Configuration de l\'écouteur onAuthStateChange...');
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('🔄 [App] Événement auth:', event);
      console.log('👤 [App] Utilisateur:', session?.user?.email || 'Déconnecté');
      setSession(session);
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });

    return () => {
      console.log('🛑 [App] Désabonnement de l\'écouteur auth');
      subscription.unsubscribe();
    };
  }, [setUser, setSession]);

  // Load profile when user is authenticated
  useEffect(() => {
    if (user && !profile) {
      loadProfile();
    }
  }, [user, profile, loadProfile]);

  if (authLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ width: 48, height: 48, border: '4px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
        <p style={{ color: 'var(--text-secondary)' }}>Initialisation de l'application...</p>
      </div>
    );
  }

  if (supabaseError) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', flexDirection: 'column', gap: '1.5rem', padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem' }}>⚠️</div>
        <h2 style={{ color: 'var(--text-primary)' }}>Problème de connexion</h2>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '400px' }}>{supabaseError}</p>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '0.75rem 1.5rem',
            background: 'var(--primary)',
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            fontSize: '1rem'
          }}
        >
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Landing />} />
        <Route path="login" element={<Login />} />
        <Route path="signup" element={<Signup />} />
        <Route path="about" element={<About />} />
        <Route path="analyze" element={<Analyze />} />
        <Route 
          path="history" 
          element={
            <ProtectedRoute>
              <History />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="dashboard" 
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="settings" 
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          } 
        />
        <Route 
            path="admin" 
            element={
              <ProtectedRoute requireAdmin={true}>
                <Admin />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="super-admin" 
            element={
              <ProtectedRoute requireAdmin={true}>
                <SuperAdmin />
              </ProtectedRoute>
            } 
          />
        <Route path="*" element={<Landing />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<LoadingFallback />}>
          <AppContent />
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
