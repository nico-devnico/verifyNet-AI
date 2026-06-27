import { motion } from 'framer-motion';
import { Moon, Trash2, Info, User, Save, Loader2 } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import useStore from '../store';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import './Settings.css';

export default function Settings() {
  const { isDark, toggleTheme } = useTheme();
  const { clearHistory, history, user, profile, setProfile, loadProfile } = useStore();
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    username: '',
    bio: '',
    avatar_url: ''
  });

  // Load profile data into form
  useEffect(() => {
    if (profile) {
      setFormData({
        first_name: profile.first_name || '',
        last_name: profile.last_name || '',
        username: profile.username || '',
        bio: profile.bio || '',
        avatar_url: profile.avatar_url || ''
      });
    }
  }, [profile]);

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!user) return;

    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const { error } = await supabase
        .from('profiles')
        .update(formData)
        .eq('id', user.id);

      if (error) throw error;
      
      setSaveSuccess(true);
      await loadProfile(); // Refresh profile from DB
      
      // Hide success message after 3 seconds
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Error saving profile:', err);
      alert('Erreur lors de la sauvegarde du profil');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="settings-page">
      <div className="container container-sm">
        <motion.div className="page-header" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1>Paramètres & Profil</h1>
          <p>Gérez votre compte et personnalisez votre expérience</p>
        </motion.div>

        <div className="settings-group">
          {/* Profile Section */}
          <div className="settings-card card">
            <h3 className="settings-section-title">
              <User size={20} /> Profil
            </h3>
            <form onSubmit={handleSaveProfile} className="profile-form">
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="first_name">Prénom</label>
                  <input
                    type="text"
                    id="first_name"
                    name="first_name"
                    value={formData.first_name}
                    onChange={handleInputChange}
                    placeholder="Votre prénom"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="last_name">Nom</label>
                  <input
                    type="text"
                    id="last_name"
                    name="last_name"
                    value={formData.last_name}
                    onChange={handleInputChange}
                    placeholder="Votre nom"
                  />
                </div>
              </div>
              
              <div className="form-group">
                <label htmlFor="username">Nom d'utilisateur</label>
                <input
                  type="text"
                  id="username"
                  name="username"
                  value={formData.username}
                  onChange={handleInputChange}
                  placeholder="Votre nom d'utilisateur"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="bio">Bio</label>
                <textarea
                  id="bio"
                  name="bio"
                  value={formData.bio}
                  onChange={handleInputChange}
                  placeholder="Parlez-nous de vous..."
                  rows={3}
                />
              </div>

              <div className="form-actions">
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <>
                      <Loader2 size={16} className="spinner" />
                      Sauvegarde...
                    </>
                  ) : (
                    <>
                      <Save size={16} />
                      Sauvegarder
                    </>
                  )}
                </button>
                {saveSuccess && (
                  <span className="save-success">✓ Profil sauvegardé !</span>
                )}
              </div>
            </form>
          </div>

          {/* Theme Section */}
          <div className="settings-card card">
            <div className="setting-row">
              <div>
                <h3>Mode sombre</h3>
                <p>Basculer entre le thème clair et sombre</p>
              </div>
              <button className={`toggle-switch ${isDark ? 'active' : ''}`} onClick={toggleTheme} role="switch" aria-checked={isDark} aria-label="Mode sombre">
                <span className="toggle-knob" />
              </button>
            </div>
          </div>

          {/* History Section */}
          <div className="settings-card card">
            <div className="setting-row">
              <div>
                <h3>Historique</h3>
                <p>{history.length} analyse{history.length !== 1 ? 's' : ''} sauvegardée{history.length !== 1 ? 's' : ''}</p>
              </div>
              <button className="btn btn-secondary" onClick={clearHistory} disabled={history.length === 0}>Effacer tout</button>
            </div>
          </div>

          {/* Info Section */}
          <div className="settings-card card">
            <div className="setting-row">
              <div>
                <h3>Version</h3>
                <p>VerifyNet v1.0.0</p>
              </div>
              <span className="badge badge-info">Stable</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
