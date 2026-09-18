import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sun, Moon, Menu, X, CheckCircle, User, LogOut, Settings, Shield, Crown,
  Search, Gauge,
} from 'lucide-react';

import { useTheme } from '../../hooks/useTheme';
import useStore from '../../store';
import NotificationBell from './NotificationBell';
import './Navbar.css';

export default function Navbar() {
  const { isDark, toggleTheme } = useTheme();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const { user, profile, signOut, isAdmin, isSuperAdmin, usage, setting } = useStore();

  const navLinks = [
    { to: '/', label: 'Accueil' },
    { to: '/analyze', label: 'Analyser' },
    ...(user
      ? [
          { to: '/history', label: 'Historique' },
          { to: '/dashboard', label: 'Tableau de bord' },
          ...(isAdmin() ? [{ to: '/admin', label: 'Admin' }] : []),
          ...(isSuperAdmin() ? [{ to: '/super-admin', label: 'Super Admin' }] : []),
        ]
      : []),
  ];

  const displayName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') ||
    profile?.username ||
    user?.email;

  /* Le quota vient de la fonction `my_usage_today` : c'est la même valeur que
     celle appliquée par le serveur pour accepter ou refuser une analyse. */
  const showQuota = usage?.authenticated && !usage.unlimited;

  /* Ouvre la palette de commandes en simulant son raccourci, pour éviter
     d'exposer un état global juste pour ce bouton. */
  const openPalette = () => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })
    );
  };

  return (
    <nav className="navbar" role="navigation" aria-label="Navigation principale">
      <div className="container navbar-inner">
        <Link to="/" className="navbar-brand" aria-label={`${setting('app_name', 'VerifyNet')} — Accueil`}>
          <CheckCircle size={26} className="navbar-brand-icon" />
          <span className="brand-copy">
            <span className="brand-text">{setting('app_name', 'VerifyNet')}</span>
            {setting('app_tagline') && (
              <span className="brand-tagline">{setting('app_tagline')}</span>
            )}
          </span>
        </Link>

        <div className="nav-links" role="menubar">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              role="menuitem"
              className={`nav-link ${location.pathname === link.to ? 'active' : ''}`}
            >
              {link.label}
              {location.pathname === link.to && (
                <motion.div className="nav-indicator" layoutId="nav-indicator" />
              )}
            </Link>
          ))}
        </div>

        <div className="nav-actions">
          <button
            className="nav-palette"
            onClick={openPalette}
            aria-label="Ouvrir la recherche rapide"
            title="Recherche rapide (Ctrl+K)"
          >
            <Search size={15} />
            <span className="nav-palette-label">Rechercher</span>
            <span className="kbd">Ctrl</span>
            <span className="kbd">K</span>
          </button>

          {showQuota && (
            <Link
              to="/dashboard"
              className={`nav-quota${usage.remaining === 0 ? ' is-exhausted' : ''}`}
              title={`${usage.used} analyse(s) sur ${usage.limit} aujourd’hui`}
            >
              <Gauge size={14} />
              {usage.remaining}/{usage.limit}
            </Link>
          )}

          <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={isDark ? 'Activer le mode clair' : 'Activer le mode sombre'}
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {user && <NotificationBell />}

          {user ? (
            <div className="user-menu">
              <div className="user-avatar" title={displayName}>
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="" />
                ) : (
                  <User size={16} />
                )}
              </div>
              <div className="user-dropdown">
                <div className="user-dropdown-header">
                  <strong>{displayName}</strong>
                  <span>{user.email}</span>
                </div>
                <Link to="/settings" className="user-dropdown-item">
                  <Settings size={16} />
                  Paramètres et profil
                </Link>
                {isAdmin() && (
                  <Link to="/admin" className="user-dropdown-item">
                    <Shield size={16} />
                    Administration
                  </Link>
                )}
                {isSuperAdmin() && (
                  <Link to="/super-admin" className="user-dropdown-item">
                    <Crown size={16} />
                    Super administration
                  </Link>
                )}
                <button className="user-dropdown-item" onClick={signOut}>
                  <LogOut size={16} />
                  Se déconnecter
                </button>
              </div>
            </div>
          ) : (
            <Link to="/login" className="btn btn-primary btn-sm">
              Se connecter
            </Link>
          )}

          <button
            className="mobile-toggle"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Menu"
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="mobile-menu"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`mobile-link ${location.pathname === link.to ? 'active' : ''}`}
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            {user ? (
              <>
                <Link to="/settings" className="mobile-link" onClick={() => setMobileOpen(false)}>
                  Paramètres et profil
                </Link>
                <div className="mobile-user">
                  <User size={18} />
                  <span>{user.email}</span>
                </div>
                <button className="mobile-link mobile-logout" onClick={signOut}>
                  <LogOut size={16} />
                  Se déconnecter
                </button>
              </>
            ) : (
              <Link to="/login" className="mobile-link" onClick={() => setMobileOpen(false)}>
                Se connecter
              </Link>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
