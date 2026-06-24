import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, Zap, AlertTriangle, CheckCircle2, LayoutDashboard } from 'lucide-react';
import useStore from '../store';
import './Dashboard.css';

export default function Dashboard() {
  const { history } = useStore();

  const stats = useMemo(() => {
    const total = history.length;
    if (total === 0) return { total: 0, avgScore: 0, fakeNews: 0, distribution: { credible: 0, verify: 0, doubtful: 0, fake: 0 } };
    const avgScore = Math.round(history.reduce((s, a) => s + (a.score || 0), 0) / total);
    const fakeNews = history.filter((a) => a.score < 41).length;
    const distribution = {
      credible: history.filter((a) => a.score >= 61).length,
      verify: history.filter((a) => a.score >= 41 && a.score <= 60).length,
      doubtful: history.filter((a) => a.score >= 21 && a.score <= 40).length,
      fake: history.filter((a) => a.score <= 20).length,
    };
    return { total, avgScore, fakeNews, distribution };
  }, [history]);

  const bars = [
    { label: 'Crédible', value: stats.distribution.credible, color: 'var(--success)' },
    { label: 'À vérifier', value: stats.distribution.verify, color: 'var(--warning)' },
    { label: 'Douteux', value: stats.distribution.doubtful, color: '#f97316' },
    { label: 'Fake News', value: stats.distribution.fake, color: 'var(--danger)' },
  ];

  return (
    <div className="dashboard-page">
      <div className="container">
        <motion.div className="page-header" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1>Dashboard</h1>
          <p>Vue d'ensemble de vos analyses</p>
        </motion.div>

        {history.length === 0 ? (
          <div className="empty-state">
            <LayoutDashboard size={44} strokeWidth={1.5} />
            <p>Aucune donnée à afficher. Lancez votre première analyse !</p>
          </div>
        ) : (
          <>
            {/* Stats Grid */}
            <div className="dash-stats">
              {[
                { label: 'Total analyses', value: stats.total, Icon: BarChart3 },
                { label: 'Score moyen', value: stats.avgScore + '/100', Icon: Zap },
                { label: 'Fake News détectées', value: stats.fakeNews, Icon: AlertTriangle },
                { label: 'Taux fiabilité', value: Math.round((stats.distribution.credible / stats.total) * 100) + '%', Icon: CheckCircle2 },
              ].map((s, i) => (
                <motion.div key={i} className="dash-stat-card card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
                  <div className="dash-stat-icon"><s.Icon size={22} /></div>
                  <span className="dash-stat-value">{s.value}</span>
                  <span className="dash-stat-label">{s.label}</span>
                </motion.div>
              ))}
            </div>

            {/* Distribution Chart */}
            <motion.div className="dash-chart card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              <h3>Répartition des résultats</h3>
              <div className="chart-bars">
                {bars.map((b, i) => {
                  const pct = stats.total > 0 ? (b.value / stats.total) * 100 : 0;
                  return (
                    <div key={i} className="chart-bar-row">
                      <span className="chart-label">{b.label}</span>
                      <div className="chart-bar-track">
                        <motion.div className="chart-bar-fill" style={{ background: b.color }} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ delay: 0.5 + i * 0.1, duration: 0.6 }} />
                      </div>
                      <span className="chart-value">{b.value} ({Math.round(pct)}%)</span>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}
