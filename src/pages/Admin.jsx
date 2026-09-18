import { lazy, Suspense, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, Crown, Database, BarChart3, Loader2, ArrowUpRight } from 'lucide-react';

import useStore from '../store';
import './Admin.css';
import '../pages/SuperAdmin.css';

/*
 * Console de modération, accessible aux rôles `admin` et `super_admin`.
 *
 * Elle réutilise les onglets de la console super admin plutôt que d'écrire
 * elle-même dans `profiles` : les fonctions RPC vérifient les droits et
 * journalisent chaque action. Un `admin` peut consulter les statistiques et
 * modérer les contenus ; la gestion des comptes, des réglages et de l'audit
 * reste réservée au super admin, qui dispose de sa propre console.
 */
const OverviewTab = lazy(() => import('./superadmin/OverviewTab'));
const ContentTab = lazy(() => import('./superadmin/ContentTab'));

const TABS = [
  { id: 'overview', label: 'Statistiques', icon: BarChart3, Component: OverviewTab },
  { id: 'content', label: 'Modération des contenus', icon: Database, Component: ContentTab },
];

export default function Admin() {
  const { user, profile, isAdmin, isSuperAdmin } = useStore();
  const [activeTab, setActiveTab] = useState('overview');

  if (!isAdmin()) return <Navigate to="/" replace />;

  const ActiveComponent = TABS.find((t) => t.id === activeTab)?.Component ?? OverviewTab;

  return (
    <div className="sa-page">
      <div className="container">
        <motion.header
          className="sa-header"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="sa-header-text">
            <h1><Shield size={26} /> Modération</h1>
            <p>
              Statistiques réelles de la plateforme et modération des analyses publiées.
              Chaque action est enregistrée dans le journal d’audit.
            </p>
          </div>

          <div className="sa-identity">
            <div className="sa-avatar">{user?.email?.charAt(0).toUpperCase() || 'A'}</div>
            <div className="sa-identity-text">
              <strong>{user?.email}</strong>
              <span>
                <Shield size={12} />
                {profile?.role === 'super_admin' ? 'Super administrateur' : 'Administrateur'}
              </span>
            </div>
          </div>
        </motion.header>

        {isSuperAdmin() && (
          <Link to="/super-admin" className="admin-escalate">
            <Crown size={16} />
            <span>
              <strong>Console de super administration</strong>
              Comptes, quotas, réglages de la plateforme, diffusion et audit complet.
            </span>
            <ArrowUpRight size={16} />
          </Link>
        )}

        <nav className="sa-tabs" role="tablist" aria-label="Sections de modération">
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
          <Suspense
            fallback={
              <div className="sa-loading">
                <Loader2 size={30} className="spinner" />
                <p>Chargement…</p>
              </div>
            }
          >
            <ActiveComponent />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
