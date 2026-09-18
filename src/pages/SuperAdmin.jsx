import { useState, lazy, Suspense, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Crown, Users, Activity, Settings, BarChart3, Database, Megaphone, Loader2,
} from 'lucide-react';

import useStore from '../store';
import './SuperAdmin.css';

/* Onglet Utilisateurs chargé en priorité : c'est la destination par défaut. */
import UsersTab from './superadmin/UsersTab';

const OverviewTab = lazy(() => import('./superadmin/OverviewTab'));
const ContentTab = lazy(() => import('./superadmin/ContentTab'));
const SettingsTab = lazy(() => import('./superadmin/SettingsTab'));
const AuditTab = lazy(() => import('./superadmin/AuditTab'));
const BroadcastTab = lazy(() => import('./superadmin/BroadcastTab'));

const TABS = [
  { id: 'overview', label: 'Vue d’ensemble', icon: BarChart3, Component: OverviewTab, eager: false },
  { id: 'users', label: 'Utilisateurs', icon: Users, Component: UsersTab, eager: true },
  { id: 'content', label: 'Contenus', icon: Database, Component: ContentTab, eager: false },
  { id: 'settings', label: 'Paramètres', icon: Settings, Component: SettingsTab, eager: false },
  { id: 'broadcast', label: 'Diffusion', icon: Megaphone, Component: BroadcastTab, eager: false },
  { id: 'audit', label: 'Journal d’audit', icon: Activity, Component: AuditTab, eager: false },
];

export default function SuperAdmin() {
  const { user, profile, isSuperAdmin } = useStore();
  const [activeTab, setActiveTab] = useState('users');
  const [visited, setVisited] = useState(() => new Set(['users']));

  useEffect(() => {
    setVisited((prev) => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  if (!isSuperAdmin()) return <Navigate to="/" replace />;

  return (
    <div className="sa-page">
      <div className="container">
        <motion.header
          className="sa-header"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="sa-header-text">
            <h1><Crown size={28} /> Super administration</h1>
            <p>
              Chaque action ci-dessous s’applique immédiatement à la base.
              L’activité des membres et des visiteurs sans compte y est visible.
            </p>
          </div>

          <div className="sa-identity">
            <div className="sa-avatar">{user?.email?.charAt(0).toUpperCase() || 'A'}</div>
            <div className="sa-identity-text">
              <strong>{user?.email}</strong>
              <span>
                <Crown size={12} />
                {profile?.role === 'super_admin' ? 'Super administrateur' : 'Administrateur'}
              </span>
            </div>
          </div>
        </motion.header>

        <nav className="sa-tabs" role="tablist" aria-label="Sections d'administration">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={activeTab === t.id}
              className={`sa-tab ${activeTab === t.id ? 'active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              <t.icon size={17} />
              {t.label}
            </button>
          ))}
        </nav>

        <div className="sa-content" role="tabpanel">
          {TABS.map((t) => {
            if (!visited.has(t.id)) return null;
            const hidden = t.id !== activeTab;
            const Comp = t.Component;

            if (t.eager) {
              return (
                <div
                  key={t.id}
                  hidden={hidden}
                  style={hidden ? { display: 'none' } : undefined}
                >
                  <Comp />
                </div>
              );
            }

            return (
              <div
                key={t.id}
                hidden={hidden}
                style={hidden ? { display: 'none' } : undefined}
              >
                <Suspense
                  fallback={
                    <div className="sa-loading">
                      <Loader2 size={30} className="spinner" />
                      <p>Chargement…</p>
                    </div>
                  }
                >
                  <Comp />
                </Suspense>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
