import { useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Mail, Lock, Eye, EyeOff, UserPlus, User, ShieldOff, CheckCircle2, Loader2,
} from 'lucide-react';

import { supabase } from '../lib/supabase';
import useStore from '../store';
import { formatAuthError, logAuthAction } from '../utils/authErrors';
import './Auth.css';

/** Force du mot de passe, purement indicative pour guider l'utilisateur. */
function passwordScore(pw) {
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  return Math.min(score, 4);
}

const STRENGTH = [
  { label: 'Très faible', tone: 'danger' },
  { label: 'Faible', tone: 'danger' },
  { label: 'Correct', tone: 'warning' },
  { label: 'Bon', tone: 'success' },
  { label: 'Excellent', tone: 'success' },
];

export default function Signup() {
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', password: '', confirm: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');

  const navigate = useNavigate();
  const location = useLocation();
  const { user, settingBool, setting } = useStore();

  const from = location.state?.from?.pathname || '/dashboard';
  const registrationsOpen = settingBool('enable_registrations', true);

  const strength = useMemo(() => passwordScore(form.password), [form.password]);

  if (user) return <Navigate to={from} replace />;

  /* Inscriptions fermées par le super admin. Le trigger `handle_new_user`
     refuse également l'insertion côté base : cet écran évite simplement à
     l'utilisateur de remplir un formulaire voué à échouer. */
  if (!registrationsOpen) {
    return (
      <div className="auth-page">
        <div className="auth-container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="auth-card auth-card-centered"
          >
            <span className="auth-status-icon"><ShieldOff size={28} /></span>
            <h1>Inscriptions fermées</h1>
            <p className="auth-status-text">
              La création de nouveaux comptes sur {setting('app_name', 'VerifyNet')} est
              momentanément suspendue par l’administrateur. Vous pouvez toujours
              vous connecter avec un compte existant, ou analyser un contenu sans compte.
            </p>
            <div className="auth-status-actions">
              <Link to="/login" className="btn btn-primary">Se connecter</Link>
              <Link to="/analyze" className="btn btn-secondary">Analyser sans compte</Link>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const handleEmailSignup = async (e) => {
    e.preventDefault();
    setError('');

    if (form.password !== form.confirm) {
      setError('Les deux mots de passe saisis ne sont pas identiques.');
      return;
    }
    if (form.password.length < 8) {
      setError('Choisissez un mot de passe de 8 caractères minimum.');
      return;
    }

    setLoading(true);
    logAuthAction('Tentative d’inscription', { email: form.email });

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: {
          emailRedirectTo: `${window.location.origin}${from}`,
          // Repris par le trigger handle_new_user pour préremplir le profil.
          data: {
            first_name: form.firstName.trim() || null,
            last_name: form.lastName.trim() || null,
          },
        },
      });

      if (signUpError) throw signUpError;

      logAuthAction('Inscription réussie', { session: Boolean(data.session) });

      if (data.session) navigate(from, { replace: true });
      else setSentTo(form.email.trim());
    } catch (err) {
      logAuthAction('Échec de l’inscription', { error: err.message });
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    setLoading(true);
    setError('');
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}${from}`, scopes: 'email profile' },
      });
      if (oauthError) throw oauthError;
    } catch (err) {
      setError(formatAuthError(err));
      setLoading(false);
    }
  };

  if (sentTo) {
    return (
      <div className="auth-page">
        <div className="auth-container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="auth-card auth-card-centered"
          >
            <span className="auth-status-icon is-success"><CheckCircle2 size={28} /></span>
            <h1>Vérifiez votre boîte mail</h1>
            <p className="auth-status-text">
              Un lien de confirmation vient d’être envoyé à <strong>{sentTo}</strong>.
              Cliquez dessus pour activer votre compte, puis revenez vous connecter.
            </p>
            <div className="auth-status-actions">
              <Link to="/login" className="btn btn-primary">Aller à la connexion</Link>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="auth-card"
        >
          <div className="auth-header">
            <h1>Créer un compte</h1>
            <p>
              Historique conservé, statistiques personnelles et partage de vos
              rapports par lien.
            </p>
          </div>

          {error && <div className="auth-error" role="alert">{error}</div>}

          <form onSubmit={handleEmailSignup} className="auth-form">
            <div className="auth-row">
              <div className="auth-input-group">
                <User size={18} className="auth-icon" />
                <input
                  type="text"
                  placeholder="Prénom"
                  value={form.firstName}
                  onChange={update('firstName')}
                  autoComplete="given-name"
                />
              </div>
              <div className="auth-input-group">
                <input
                  type="text"
                  placeholder="Nom"
                  value={form.lastName}
                  onChange={update('lastName')}
                  autoComplete="family-name"
                />
              </div>
            </div>

            <div className="auth-input-group">
              <Mail size={18} className="auth-icon" />
              <input
                type="email"
                placeholder="Adresse email"
                value={form.email}
                onChange={update('email')}
                required
                autoComplete="email"
              />
            </div>

            <div className="auth-input-group">
              <Lock size={18} className="auth-icon" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Mot de passe"
                value={form.password}
                onChange={update('password')}
                required
                autoComplete="new-password"
                minLength={8}
              />
              <button
                type="button"
                className="auth-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {form.password && (
              <div className={`auth-strength tone-${STRENGTH[strength].tone}`}>
                <div className="auth-strength-bars">
                  {[0, 1, 2, 3].map((i) => (
                    <span key={i} className={i < strength ? 'is-filled' : ''} />
                  ))}
                </div>
                <span>{STRENGTH[strength].label}</span>
              </div>
            )}

            <div className="auth-input-group">
              <Lock size={18} className="auth-icon" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Confirmer le mot de passe"
                value={form.confirm}
                onChange={update('confirm')}
                required
                autoComplete="new-password"
                minLength={8}
              />
            </div>

            <button type="submit" className="btn btn-primary w-full" disabled={loading}>
              {loading ? <Loader2 size={18} className="spinner" /> : <UserPlus size={18} />}
              {loading ? 'Création du compte…' : 'Créer mon compte'}
            </button>
          </form>

          <div className="auth-divider"><span>ou</span></div>

          <button
            type="button"
            className="btn btn-outline w-full"
            onClick={handleGoogleSignup}
            disabled={loading}
          >
            <svg className="google-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.99 7.64.99 9.68.99 12s1.01 4.32 1.19 5.31l2.84-2.77 2.84z" />
              <path fill="#EA4335" d="M12 4.58c1.63 0 3.09.56 4.24 1.65l3.19-3.19C17.45 1.03 14.97 0 12 0 7.7 0 3.99 2.47 2.18 6.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continuer avec Google
          </button>

          <div className="auth-footer">
            <p>Déjà un compte ?</p>
            <Link to="/login" className="auth-link">Se connecter</Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
