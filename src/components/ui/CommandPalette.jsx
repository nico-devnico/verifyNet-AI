import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Search, Home, FileSearch, History, LayoutDashboard, Settings, Info,
  Shield, Crown, LogIn, LogOut, UserPlus, Sun, Moon, CornerDownLeft,
} from 'lucide-react';
import useStore from '../../store';
import './CommandPalette.css';

/**
 * Palette de commandes (Ctrl/⌘ + K) : navigation et actions rapides au clavier.
 */
export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef(null);
  const navigate = useNavigate();

  const { user, theme, toggleTheme, signOut, isAdmin, isSuperAdmin } = useStore();

  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
    }
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

  const commands = useMemo(() => {
    const go = (to) => () => navigate(to);

    const items = [
      { id: 'home', label: 'Accueil', hint: 'Page d’accueil', icon: Home, run: go('/') },
      { id: 'analyze', label: 'Nouvelle analyse', hint: 'Texte, URL, image ou document', icon: FileSearch, run: go('/analyze') },
      { id: 'about', label: 'À propos', hint: 'Comment fonctionne VerifyNet', icon: Info, run: go('/about') },
    ];

    if (user) {
      items.push(
        { id: 'history', label: 'Historique', hint: 'Vos analyses enregistrées', icon: History, run: go('/history') },
        { id: 'dashboard', label: 'Tableau de bord', hint: 'Vos statistiques', icon: LayoutDashboard, run: go('/dashboard') },
        { id: 'settings', label: 'Paramètres et profil', icon: Settings, run: go('/settings') },
      );
      if (isAdmin()) {
        items.push({ id: 'admin', label: 'Administration', icon: Shield, run: go('/admin') });
      }
      if (isSuperAdmin()) {
        items.push({ id: 'super', label: 'Super administration', hint: 'Utilisateurs, réglages, audit', icon: Crown, run: go('/super-admin') });
      }
      items.push({ id: 'logout', label: 'Se déconnecter', icon: LogOut, run: () => signOut() });
    } else {
      items.push(
        { id: 'login', label: 'Se connecter', icon: LogIn, run: go('/login') },
        { id: 'signup', label: 'Créer un compte', icon: UserPlus, run: go('/signup') },
      );
    }

    items.push({
      id: 'theme',
      label: theme === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre',
      icon: theme === 'dark' ? Sun : Moon,
      run: toggleTheme,
    });

    return items;
  }, [user, theme, toggleTheme, signOut, isAdmin, isSuperAdmin, navigate]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) => c.label.toLowerCase().includes(q) || c.hint?.toLowerCase().includes(q)
    );
  }, [commands, query]);

  useEffect(() => {
    setActive((i) => Math.min(i, Math.max(results.length - 1, 0)));
  }, [results.length]);

  const runCommand = useCallback(
    (command) => {
      close();
      // Laisse la palette se fermer avant de naviguer, sinon l'animation saute.
      setTimeout(() => command.run(), 10);
    },
    [close]
  );

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % Math.max(results.length, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % Math.max(results.length, 1));
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault();
      runCommand(results[active]);
    } else if (e.key === 'Escape') {
      close();
    }
  };

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="palette-root">
          <motion.div
            className="palette-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
          />
          <motion.div
            className="palette"
            role="dialog"
            aria-modal="true"
            aria-label="Palette de commandes"
            initial={{ opacity: 0, y: -18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          >
            <div className="palette-input-row">
              <Search size={18} />
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Rechercher une page ou une action…"
                aria-label="Rechercher une commande"
              />
              <span className="kbd">Échap</span>
            </div>

            <div className="palette-list" ref={listRef} role="listbox">
              {results.length === 0 && (
                <p className="palette-empty">Aucun résultat pour « {query} »</p>
              )}
              {results.map((c, i) => (
                <button
                  key={c.id}
                  data-index={i}
                  role="option"
                  aria-selected={i === active}
                  className={`palette-item ${i === active ? 'active' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => runCommand(c)}
                >
                  <c.icon size={17} />
                  <span className="palette-item-label">
                    {c.label}
                    {c.hint && <small>{c.hint}</small>}
                  </span>
                  {i === active && <CornerDownLeft size={14} className="palette-enter" />}
                </button>
              ))}
            </div>

            <div className="palette-footer">
              <span><span className="kbd">↑</span><span className="kbd">↓</span> naviguer</span>
              <span><span className="kbd">↵</span> ouvrir</span>
              <span><span className="kbd">Ctrl</span>+<span className="kbd">K</span> fermer</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
