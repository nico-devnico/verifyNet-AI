import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sun, Moon, Menu, X, LogIn, CheckCircle, User, LogOut, Settings, Shield, Crown } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';
import useStore from '../../store';
import './Navbar.css';

export default function Navbar() {
  const { isDark, toggleTheme } = useTheme();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, signOut, isAdmin, isSuperAdmin } = useStore();
  
  // Build nav links: Accueil and Analyser always visible; others only when authenticated
  const navLinks = [
    { to: '/', label: 'Accueil' },
    { to: '/analyze', label: 'Analyser' },
    ...(user ? [
      { to: '/history', label: 'Historique' },
      { to: '/dashboard', label: 'Dashboard' },
      ...(isAdmin() ? [{ to: '/admin', label: 'Admin' }] : []),
      ...(isSuperAdmin() ? [{ to: '/super-admin', label: 'Super Admin' }] : [])
    ] : [])
  ];

  return (
    <nav className="navbar" role="navigation" aria-label="Navigation principale">
      <div className="container navbar-inner">
        <Link to="/" className="navbar-brand" aria-label="VerifyNet - Accueil">
          <CheckCircle size={26} className="navbar-brand-icon" />
          <span className="brand-text">VerifyNet</span>
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
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={isDark ? 'Activer le mode clair' : 'Activer le mode sombre'}
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {user ? (
            <div className="user-menu">
              <div className="user-avatar" title={user.email}>
                <User size={16} />
              </div>
              <div className="user-dropdown">
                <Link to="/settings" className="user-dropdown-item">
                  <Settings size={16} />
                  Paramètres & Profil
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
                    Super Administration
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

          <button className="mobile-toggle" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Menu" aria-expanded={mobileOpen}>
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
              <Link key={link.to} to={link.to} className={`mobile-link ${location.pathname === link.to ? 'active' : ''}`} onClick={() => setMobileOpen(false)}>
                {link.label}
              </Link>
            ))}
            {user ? (
              <>
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
