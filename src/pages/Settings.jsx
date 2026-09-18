import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  User, Save, Loader2, Moon, KeyRound, Gauge, Trash2, ShieldCheck,
  BadgeCheck, Crown, Shield, AlertTriangle,
} from 'lucide-react';

import { useTheme } from '../hooks/useTheme';
import useStore from '../store';
import { supabase } from '../lib/supabase';
import { deleteAllMyAnalyses } from '../services/analyses';
import { toast } from '../store/toast';
import { ConfirmDialog } from '../components/ui/Modal';
import './Settings.css';

const ROLE_BADGES = {
  super_admin: { label: 'Super administrateur', Icon: Crown, className: 'badge-gold' },
  admin: { label: 'Administrateur', Icon: Shield, className: 'badge-info' },
  user: { label: 'Compte vérifié', Icon: BadgeCheck, className: 'badge-success' },
};

export default function Settings() {
  const { isDark, toggleTheme } = useTheme();
  const {
    user, profile, updateProfile, localHistory, clearLocalHistory, usage, loadUsage,
  } = useStore();

  const [form, setForm] = useState({
    first_name: '', last_name: '', username: '', bio: '',
  });
  const [saving, setSaving] = useState(false);
  const [password, setPassword] = useState({ next: '', confirm: '' });
  const [changingPassword, setChangingPassword] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({
        first_name: profile.first_name || '',
        last_name: profile.last_name || '',
        username: profile.username || '',
        bio: profile.bio || '',
      });
    }
  }, [profile]);

  useEffect(() => { if (user) loadUsage(); }, [user, loadUsage]);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const saveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateProfile(form);
      toast.success('Profil mis à jour.');
    } catch (err) {
      toast.error(err.message, 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    if (password.next !== password.confirm) {
      toast.error('Les deux mots de passe saisis ne sont pas identiques.');
      return;
    }
    if (password.next.length < 8) {
      toast.error('Choisissez un mot de passe de 8 caractères minimum.');
      return;
    }

    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: password.next });
      if (error) throw error;
      setPassword({ next: '', confirm: '' });
      toast.success('Mot de passe modifié.', 'Sécurité');
    } catch (err) {
      toast.error(err.message, 'Modification refusée');
    } finally {
      setChangingPassword(false);
    }
  };

  const wipeAnalyses = async () => {
    setBusy(true);
    try {
      await deleteAllMyAnalyses(user.id);
      clearLocalHistory();
      await loadUsage();
      toast.success('Toutes vos analyses ont été supprimées.');
      setConfirmAction(null);
    } catch (err) {
      toast.error(err.message, 'Suppression impossible');
    } finally {
      setBusy(false);
    }
  };

  const role = ROLE_BADGES[profile?.role] || ROLE_BADGES.user;

  return (
    <div className="settings-page">
      <div className="container container-sm">
        <motion.div
          className="page-header"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1>Paramètres et profil</h1>
          <p>Gérez votre compte, votre sécurité et vos préférences d’affichage.</p>
        </motion.div>

        <div className="settings-group">
          {/* Identité */}
          <div className="settings-card card">
            <div className="settings-identity">
              <div className="settings-avatar">
                {(profile?.first_name || user?.email || '?').charAt(0).toUpperCase()}
              </div>
              <div>
                <strong>{user?.email}</strong>
                <div className="row" style={{ gap: 8, marginTop: 6 }}>
                  <span className={`badge ${role.className}`}>
                    <role.Icon size={12} /> {role.label}
                  </span>
                  {profile?.created_at && (
                    <span className="text-muted" style={{ fontSize: '.8125rem' }}>
                      membre depuis le{' '}
                      {new Date(profile.created_at).toLocaleDateString('fr-FR')}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Quota */}
          {usage?.authenticated && (
            <div className="settings-card card">
              <h3 className="settings-section-title"><Gauge size={20} /> Utilisation du jour</h3>
              {usage.unlimited ? (
                <p className="settings-hint">
                  Votre rôle vous exempte de la limite quotidienne d’analyses.
                </p>
              ) : (
                <>
                  <div className="settings-quota-row">
                    <span><strong>{usage.used}</strong> analyse{usage.used !== 1 ? 's' : ''} effectuée{usage.used !== 1 ? 's' : ''}</span>
                    <span className="text-muted">limite : {usage.limit}/jour</span>
                  </div>
                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{ width: `${Math.min((usage.used / usage.limit) * 100, 100)}%` }}
                    />
                  </div>
                  <p className="settings-hint">
                    Le compteur repart à zéro chaque jour à minuit.
                  </p>
                </>
              )}
            </div>
          )}

          {/* Profil */}
          <div className="settings-card card">
            <h3 className="settings-section-title"><User size={20} /> Profil</h3>
            <form onSubmit={saveProfile} className="profile-form">
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="first_name">Prénom</label>
                  <input
                    type="text" id="first_name" name="first_name"
                    value={form.first_name} onChange={handleChange}
                    placeholder="Votre prénom"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="last_name">Nom</label>
                  <input
                    type="text" id="last_name" name="last_name"
                    value={form.last_name} onChange={handleChange}
                    placeholder="Votre nom"
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="username">Nom d’utilisateur</label>
                <input
                  type="text" id="username" name="username"
                  value={form.username} onChange={handleChange}
                  placeholder="Affiché sur vos rapports partagés"
                />
              </div>

              <div className="form-group">
                <label htmlFor="bio">Bio</label>
                <textarea
                  id="bio" name="bio" rows={3}
                  value={form.bio} onChange={handleChange}
                  placeholder="Quelques mots sur vous…"
                />
              </div>

              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving
                    ? <><Loader2 size={16} className="spinner" /> Enregistrement…</>
                    : <><Save size={16} /> Enregistrer</>}
                </button>
              </div>
            </form>
          </div>

          {/* Sécurité */}
          <div className="settings-card card">
            <h3 className="settings-section-title"><KeyRound size={20} /> Mot de passe</h3>
            <form onSubmit={changePassword} className="profile-form">
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="new-password">Nouveau mot de passe</label>
                  <input
                    type="password" id="new-password" minLength={8}
                    autoComplete="new-password"
                    value={password.next}
                    onChange={(e) => setPassword({ ...password, next: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="confirm-password">Confirmation</label>
                  <input
                    type="password" id="confirm-password" minLength={8}
                    autoComplete="new-password"
                    value={password.confirm}
                    onChange={(e) => setPassword({ ...password, confirm: e.target.value })}
                  />
                </div>
              </div>
              <div className="form-actions">
                <button
                  type="submit"
                  className="btn btn-secondary"
                  disabled={changingPassword || !password.next}
                >
                  {changingPassword
                    ? <><Loader2 size={16} className="spinner" /> Modification…</>
                    : <><ShieldCheck size={16} /> Modifier le mot de passe</>}
                </button>
              </div>
            </form>
          </div>

          {/* Apparence */}
          <div className="settings-card card">
            <div className="setting-row">
              <div>
                <h3><Moon size={17} /> Mode sombre</h3>
                <p>Basculer entre le thème clair et le thème sombre.</p>
              </div>
              <button
                className={`toggle-switch ${isDark ? 'active' : ''}`}
                onClick={toggleTheme}
                role="switch"
                aria-checked={isDark}
                aria-label="Mode sombre"
              >
                <span className="toggle-knob" />
              </button>
            </div>
          </div>

          {/* Données */}
          <div className="settings-card card settings-danger">
            <h3 className="settings-section-title"><Trash2 size={20} /> Mes données</h3>
            <p className="settings-hint">
              La suppression efface vos analyses enregistrées en base ainsi que
              l’historique conservé dans ce navigateur. Elle est irréversible.
              {localHistory.length > 0 &&
                ` ${localHistory.length} analyse(s) locale(s) seront également effacées.`}
            </p>
            <div className="form-actions">
              <button
                className="btn btn-danger"
                onClick={() =>
                  setConfirmAction({
                    title: 'Supprimer toutes mes analyses ?',
                    message:
                      'Vos rapports, y compris ceux partagés par lien, seront définitivement supprimés.',
                  })
                }
              >
                <AlertTriangle size={16} /> Supprimer toutes mes analyses
              </button>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(confirmAction)}
        busy={busy}
        onClose={() => setConfirmAction(null)}
        onConfirm={wipeAnalyses}
        title={confirmAction?.title}
        message={confirmAction?.message}
        confirmLabel="Supprimer définitivement"
      />
    </div>
  );
}
