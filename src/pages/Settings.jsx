import { motion } from 'framer-motion';
import { Moon, Trash2, Info } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import useStore from '../store';
import './Settings.css';

export default function Settings() {
  const { isDark, toggleTheme } = useTheme();
  const { clearHistory, history } = useStore();

  return (
    <div className="settings-page">
      <div className="container container-sm">
        <motion.div className="page-header" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1>Paramètres</h1>
          <p>Personnalisez votre expérience VerifyNet</p>
        </motion.div>

        <div className="settings-group">
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

          <div className="settings-card card">
            <div className="setting-row">
              <div>
                <h3>Historique</h3>
                <p>{history.length} analyse{history.length !== 1 ? 's' : ''} sauvegardée{history.length !== 1 ? 's' : ''}</p>
              </div>
              <button className="btn btn-secondary" onClick={clearHistory} disabled={history.length === 0}>Effacer tout</button>
            </div>
          </div>

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
