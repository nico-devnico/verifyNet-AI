import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  BarChart3, Zap, AlertTriangle, CheckCircle2, LayoutDashboard,
  FileText, Link2, Image as ImageIcon, FileStack, Gauge, TrendingUp,
} from 'lucide-react';

import useStore from '../store';
import { getMyStats } from '../services/analyses';
import './Dashboard.css';

const TYPE_ROWS = [
  { key: 'text', label: 'Texte', Icon: FileText },
  { key: 'url', label: 'Liens', Icon: Link2 },
  { key: 'image', label: 'Images', Icon: ImageIcon },
  { key: 'document', label: 'Documents', Icon: FileStack },
];

const DISTRIBUTION = [
  { key: 'credible', label: 'Crédible', hint: '61 – 100', color: 'var(--success)' },
  { key: 'uncertain', label: 'À vérifier', hint: '41 – 60', color: 'var(--warning)' },
  { key: 'doubtful', label: 'Douteux', hint: '21 – 40', color: '#F97316' },
  { key: 'fake', label: 'Probablement faux', hint: '0 – 20', color: 'var(--danger)' },
];

export default function Dashboard() {
  const { usage, loadUsage } = useStore();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await getMyStats();
        if (!cancelled) setStats(data);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    loadUsage();
    return () => { cancelled = true; };
  }, [loadUsage]);

  const maxDaily = useMemo(
    () => Math.max(1, ...(stats?.series || []).map((d) => d.count)),
    [stats]
  );

  if (loading) {
    return (
      <div className="dashboard-page">
        <div className="container">
          <div className="page-header">
            <h1>Tableau de bord</h1>
            <p>Chargement de vos statistiques…</p>
          </div>
          <div className="dash-stats">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton dash-skeleton-card" />
            ))}
          </div>
          <div className="skeleton dash-skeleton-chart" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-page">
        <div className="container">
          <div className="page-header"><h1>Tableau de bord</h1></div>
          <div className="alert alert-danger">
            <AlertTriangle size={17} />
            <div>
              <strong>Statistiques indisponibles.</strong>
              <p>{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!stats || stats.total === 0) {
    return (
      <div className="dashboard-page">
        <div className="container">
          <div className="page-header">
            <h1>Tableau de bord</h1>
            <p>Vue d’ensemble de vos vérifications</p>
          </div>
          <div className="empty-state card">
            <LayoutDashboard size={42} strokeWidth={1.5} />
            <h3>Pas encore de données</h3>
            <p>Lancez votre première analyse : vos statistiques apparaîtront ici automatiquement.</p>
            <Link to="/analyze" className="btn btn-primary">Analyser une information</Link>
          </div>
        </div>
      </div>
    );
  }

  const reliabilityRate = stats.total
    ? Math.round((stats.distribution.credible / stats.total) * 100)
    : 0;

  const cards = [
    { label: 'Analyses réalisées', value: stats.total, Icon: BarChart3, tone: 'primary' },
    { label: 'Score moyen', value: `${stats.avgScore}/100`, Icon: Zap, tone: 'accent' },
    {
      label: 'Contenus douteux',
      value: stats.distribution.doubtful + stats.distribution.fake,
      Icon: AlertTriangle,
      tone: 'danger',
    },
    { label: 'Taux de fiabilité', value: `${reliabilityRate}%`, Icon: CheckCircle2, tone: 'success' },
  ];

  return (
    <div className="dashboard-page">
      <div className="container">
        <motion.div className="page-header" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
          <h1>Tableau de bord</h1>
          <p>Vue d’ensemble de vos vérifications</p>
        </motion.div>

        {/* Cartes de synthèse */}
        <div className="dash-stats">
          {cards.map((c, i) => (
            <motion.div
              key={c.label}
              className="dash-stat-card card"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
            >
              <div className={`dash-stat-icon tone-${c.tone}`}>
                <c.Icon size={20} />
              </div>
              <span className="dash-stat-value">{c.value}</span>
              <span className="dash-stat-label">{c.label}</span>
            </motion.div>
          ))}
        </div>

        {/* Quota */}
        {usage?.authenticated && !usage.unlimited && (
          <motion.div
            className="dash-quota card"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28 }}
          >
            <div className="dash-quota-head">
              <Gauge size={17} />
              <strong>Quota du jour</strong>
              <span>
                {usage.used} / {usage.limit} analyses utilisées
              </span>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${Math.min((usage.used / usage.limit) * 100, 100)}%` }}
              />
            </div>
          </motion.div>
        )}

        <div className="dash-grid">
          {/* Activité sur 14 jours */}
          <motion.div
            className="dash-chart card"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.32 }}
          >
            <div className="dash-card-head">
              <h3><TrendingUp size={17} /> Activité des 14 derniers jours</h3>
            </div>
            <div className="dash-bars">
              {stats.series.map((d, i) => (
                <div key={d.day} className="dash-bar-col" title={`${d.count} analyse(s) le ${d.day}`}>
                  <motion.div
                    className="dash-bar"
                    initial={{ height: 0 }}
                    animate={{ height: `${(d.count / maxDaily) * 100}%` }}
                    transition={{ delay: 0.4 + i * 0.03, duration: 0.45 }}
                  >
                    {d.count > 0 && <span className="dash-bar-value">{d.count}</span>}
                  </motion.div>
                  <span className="dash-bar-label">{d.day.slice(8)}</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Répartition par type */}
          <motion.div
            className="dash-types card"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.38 }}
          >
            <div className="dash-card-head">
              <h3>Par type de contenu</h3>
            </div>
            <div className="dash-type-list">
              {TYPE_ROWS.map((t) => {
                const count = stats.byType[t.key] || 0;
                const pct = stats.total ? Math.round((count / stats.total) * 100) : 0;
                return (
                  <div key={t.key} className="dash-type-row">
                    <span className="dash-type-name">
                      <t.Icon size={15} />
                      {t.label}
                    </span>
                    <div className="progress-track dash-type-track">
                      <div className="progress-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="dash-type-count">{count}</span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </div>

        {/* Distribution des verdicts */}
        <motion.div
          className="dash-chart card"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.44 }}
        >
          <div className="dash-card-head">
            <h3>Répartition des résultats</h3>
          </div>
          <div className="chart-bars">
            {DISTRIBUTION.map((b, i) => {
              const value = stats.distribution[b.key] || 0;
              const pct = stats.total ? (value / stats.total) * 100 : 0;
              return (
                <div key={b.key} className="chart-bar-row">
                  <span className="chart-label">
                    {b.label}
                    <small>{b.hint}</small>
                  </span>
                  <div className="chart-bar-track">
                    <motion.div
                      className="chart-bar-fill"
                      style={{ background: b.color }}
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ delay: 0.5 + i * 0.08, duration: 0.55 }}
                    />
                  </div>
                  <span className="chart-value">
                    {value} <small>({Math.round(pct)}%)</small>
                  </span>
                </div>
              );
            })}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
