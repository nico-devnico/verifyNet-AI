import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Shield, Users, Settings, Save, Trash2, Loader2, Crown } from 'lucide-react';
import useStore from '../store';
import { supabase } from '../lib/supabase';
import './Admin.css';

export default function Admin() {
  const { user, profile, isAdmin, isSuperAdmin } = useStore();
  const [activeTab, setActiveTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [settings, setSettings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const SUPER_ADMIN_EMAIL = 'nicodevnico@gmail.com';

  useEffect(() => {
    if (activeTab === 'users') {
      loadUsers();
    } else if (activeTab === 'settings') {
      loadSettings();
    }
  }, [activeTab]);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (err) {
      console.error('Error loading users:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('*');

      if (error) throw error;
      setSettings(data || []);
    } catch (err) {
      console.error('Error loading settings:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleUserRole = async (userId, currentRole) => {
    // Vérifier si on ne touche pas le super admin
    const targetUser = users.find(u => u.id === userId);
    if (targetUser && targetUser.email === SUPER_ADMIN_EMAIL) {
      alert('Impossible de modifier le rôle du super administrateur !');
      return;
    }

    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', userId);

      if (error) throw error;

      setUsers(users.map(u => 
        u.id === userId ? { ...u, role: newRole } : u
      ));
    } catch (err) {
      console.error('Error updating role:', err);
      alert('Erreur lors de la modification du rôle : ' + err.message);
    }
  };

  const updateSetting = async (setting) => {
    try {
      const { error } = await supabase
        .from('system_settings')
        .update({ value: setting.value })
        .eq('id', setting.id);

      if (error) throw error;
    } catch (err) {
      console.error('Error updating setting:', err);
    }
  };

  const getRoleLabel = (role) => {
    switch(role) {
      case 'super_admin': return 'Super Administrateur';
      case 'admin': return 'Administrateur';
      default: return 'Utilisateur';
    }
  };

  return (
    <div className="admin-page">
      <div className="container">
        <motion.div className="page-header" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="admin-title">
            <Shield size={28} /> Administration
            {isSuperAdmin() && (
              <span className="super-admin-badge">
                <Crown size={18} /> Super Admin
              </span>
            )}
          </h1>
          <p>Gérez les utilisateurs et les paramètres de la plateforme</p>
        </motion.div>

        <div className="admin-tabs">
          <button 
            className={`admin-tab ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            <Users size={18} /> Utilisateurs
          </button>
          <button 
            className={`admin-tab ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <Settings size={18} /> Paramètres système
          </button>
        </div>

        <div className="admin-content">
          {activeTab === 'users' && (
            <div className="admin-card card">
              <div className="admin-card-header">
                <h2>Tous les utilisateurs ({users.length})</h2>
              </div>

              {isLoading ? (
                <div className="admin-loading">
                  <Loader2 size={32} className="spinner" />
                  <p>Chargement...</p>
                </div>
              ) : (
                <div className="admin-table-wrapper">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Email</th>
                        <th>Nom</th>
                        <th>Rôle</th>
                        <th>Vérifié</th>
                        <th>Inscription</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map(userItem => (
                        <tr key={userItem.id} className={userItem.email === SUPER_ADMIN_EMAIL ? 'super-admin-row' : ''}>
                          <td className="email-cell">{userItem.email}</td>
                          <td>
                            {[userItem.first_name, userItem.last_name].filter(Boolean).join(' ') || userItem.username || '-'}
                            {userItem.email === SUPER_ADMIN_EMAIL && <span className="super-admin-indicator">👑</span>}
                          </td>
                          <td>
                            <span className={`role-badge role-${userItem.role}`}>
                              {userItem.role === 'super_admin' && <Crown size={12} className="crown-icon" />}
                              {getRoleLabel(userItem.role)}
                            </span>
                          </td>
                          <td>
                            <span className={`verified-badge ${userItem.is_verified ? 'yes' : 'no'}`}>
                              {userItem.is_verified ? '✓ Oui' : '✗ Non'}
                            </span>
                          </td>
                          <td>
                            {new Date(userItem.created_at).toLocaleDateString('fr-FR')}
                          </td>
                          <td>
                            {userItem.email === SUPER_ADMIN_EMAIL ? (
                              <span className="protected-label">Protégé</span>
                            ) : (
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => toggleUserRole(userItem.id, userItem.role)}
                              >
                                {userItem.role === 'admin' || userItem.role === 'super_admin' ? 'Rétrograder' : 'Promouvoir'}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {users.length === 0 && (
                        <tr>
                          <td colSpan={6} className="admin-empty">
                            Aucun utilisateur trouvé
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="admin-card card">
              <div className="admin-card-header">
                <h2>Paramètres système</h2>
              </div>

              {isLoading ? (
                <div className="admin-loading">
                  <Loader2 size={32} className="spinner" />
                  <p>Chargement...</p>
                </div>
              ) : (
                <div className="settings-list">
                  {settings.map(setting => (
                    <div key={setting.id} className="setting-item">
                      <div className="setting-info">
                        <h3>{setting.key}</h3>
                        {setting.description && <p>{setting.description}</p>}
                      </div>
                      <div className="setting-control">
                        <input
                          type="text"
                          value={setting.value}
                          onChange={(e) => {
                            setSettings(settings.map(s => 
                              s.id === setting.id ? { ...s, value: e.target.value } : s
                            ));
                          }}
                        />
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => updateSetting(setting)}
                        >
                          <Save size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}