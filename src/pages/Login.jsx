import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, LogIn, Loader2, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import useStore from '../store';
import { formatAuthError, logAuthAction } from '../utils/authErrors';
import './Auth.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const location = useLocation();
  const { user, profile, profileError, settingBool, setting, isAdmin, isSuperAdmin } = useStore();

  const from = location.state?.from?.pathname;

  if (user) {
    if (!profile && !profileError) {
      return (
        <div className="auth-page">
          <div className="auth-container">
            <div className="auth-card auth-card-centered">
              <Loader2 size={28} className="spinner" />
              <p>Ouverture de la session…</p>
            </div>
          </div>
        </div>
      );
    }

    const fallback = isSuperAdmin()
      ? '/super-admin'
      : isAdmin()
        ? '/admin'
        : '/dashboard';
    const dest = from && from !== '/login' ? from : fallback;
    return <Navigate to={dest} replace />;
  }

  /** Envoie un lien de réinitialisation à l'adresse déjà saisie. */
  const handleReset = async () => {
    if (!email.trim()) {
      setError('Saisissez votre adresse email pour recevoir un lien de réinitialisation.');
      return;
    }
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/settings`,
      });
      if (resetError) throw resetError;
      setNotice(`Un lien de réinitialisation a été envoyé à ${email.trim()}.`);
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    logAuthAction('Tentative de connexion email', { email });
    setLoading(true);
    setError('');

    // Validation front-end
    if (!email || !password) {
      logAuthAction('Échec: champs manquants', { email: !!email, password: !!password });
      setError('Veuillez remplir tous les champs.');
      setLoading(false);
      return;
    }

    try {
      logAuthAction('Appel API signInWithPassword');
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        logAuthAction('Échec API signInWithPassword', { error: error.message });
        throw error;
      }

      logAuthAction('Connexion réussie', { userId: data.user?.id });
      /* La redirection est faite au rendu, une fois le profil chargé : un
         administrateur doit aboutir sur sa console, pas sur un tableau de
         bord masqué par l'écran de maintenance. */
    } catch (err) {
      logAuthAction('Erreur connexion email', { error: err.message });
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    logAuthAction('Tentative de connexion Google');
    const redirectUrl = `${window.location.origin}/login`;
    setLoading(true);
    setError('');

    try {
      logAuthAction('Appel API signInWithOAuth (Google)', { redirectUrl });
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          scopes: 'email profile'
        },
      });

      if (error) {
        logAuthAction('Échec OAuth Google', { error: error.message });
        throw error;
      }

      logAuthAction('Redirection OAuth initiée', { provider: 'google' });
    } catch (err) {
      logAuthAction('Erreur connexion Google', { error: err.message });
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <motion.div 
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="auth-card">
          <div className="auth-header">
            <h1>Connexion</h1>
            <p>
              {settingBool('maintenance_mode', false)
                ? 'La plateforme est en maintenance. Connectez-vous avec un compte administrateur pour y accéder.'
                : `Accédez à votre compte ${setting('app_name', 'VerifyNet')}`}
            </p>
          </div>

          {error && <div className="auth-error" role="alert">{error}</div>}
          {notice && (
            <div className="auth-notice" role="status">
              <CheckCircle2 size={16} /> {notice}
            </div>
          )}

          <form onSubmit={handleEmailLogin} className="auth-form">
            <div className="auth-input-group">
              <Mail size={18} className="auth-icon" />
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="auth-input-group">
              <Lock size={18} className="auth-icon" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                className="auth-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label="Toggle password visibility"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            <button
              type="button"
              className="auth-link auth-forgot"
              onClick={handleReset}
              disabled={loading}
            >
              Mot de passe oublié ?
            </button>

            <button
              type="submit"
              className="btn btn-primary w-full"
              disabled={loading}
            >
              {loading ? <Loader2 size={18} className="spinner" /> : <LogIn size={18} />}
              {loading ? 'Connexion en cours…' : 'Se connecter'}
            </button>
          </form>

          <div className="auth-divider">
            <span>ou</span>
          </div>

          <button
            type="button"
            className="btn btn-outline w-full"
            onClick={handleGoogleLogin}
            disabled={loading}
          >
            <svg className="google-icon" viewBox="0 0 24 24" width="18" height="18">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.99 7.64.99 9.68.99 12s1.01 4.32 1.19 5.31l2.84-2.77 2.84z" />
              <path fill="#EA4335" d="M12 4.58c1.63 0 3.09.56 4.24 1.65l3.19-3.19C17.45 1.03 14.97 0 12 0 7.7 0 3.99 2.47 2.18 6.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continuer avec Google
          </button>

          <div className="auth-footer">
            {settingBool('maintenance_mode', false) ? (
              <p>Accès réservé aux administrateurs pendant la maintenance.</p>
            ) : settingBool('enable_registrations', true) ? (
              <>
                <p>Pas de compte ?</p>
                <Link to="/signup" className="auth-link">Créer un compte</Link>
              </>
            ) : (
              <p>Les inscriptions sont momentanément fermées.</p>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
