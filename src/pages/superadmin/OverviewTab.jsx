import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Users, FileText, Activity, ShieldAlert, RefreshCw, CheckCircle2, XCircle,
  Loader2, Share2, Trash2, TrendingUp, Stethoscope, AlertTriangle, Globe,
} from 'lucide-react';

import {
  getPlatformStats, getVisitorStats, purgeAnonymousAnalyses, runDiagnostics,
} from '../../services/admin';
import useStore from '../../store';
import { toast } from '../../store/toast';
import { ConfirmDialog } from '../../components/ui/Modal';

export default function OverviewTab() {
  const [stats, setStats] = useState(null);
  const [visitors, setVisitors] = useState(null);
  const [visitorError, setVisitorError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [diagnostics, setDiagnostics] = useState(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purgeBusy, setPurgeBusy] = useState(false);
  const isSuperAdmin = useStore((s) => s.isSuperAdmin);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setVisitorError('');
    try {
      const [platform, visitor] = await Promise.allSettled([
        getPlatformStats(14),
        getVisitorStats(14),
      ]);

      if (platform.status === 'fulfilled') {
        setStats(platform.value);
      } else {
        setError(platform.reason?.message || 'Statistiques indisponibles.');
      }

      if (visitor.status === 'fulfilled') {
        setVisitors(visitor.value);
      } else {
        setVisitors(null);
        setVisitorError(visitor.reason?.message || '');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const checkInstallation = async () => {
    setDiagLoading(true);
    try {
      const result = await runDiagnostics();
      setDiagnostics(result);
      if (result.ok) toast.success('Toutes les vérifications sont au vert.', 'Installation saine');
      else toast.warning('Certaines vérifications ont échoué, voir le détail.', 'Attention');
    } catch (err) {
      toast.error(err.message, 'Diagnostic impossible');
    } finally {
      setDiagLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="sa-cards">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton sa-skeleton-card" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-danger">
        <AlertTriangle size={18} />
        <div>
          <strong>Statistiques indisponibles</strong>
          <p>{error}</p>
          <button className="btn btn-secondary btn-sm" onClick={load} style={{ marginTop: 10 }}>
            <RefreshCw size={14} /> Réessayer
          </button>
        </div>
      </div>
    );
  }

  const v = visitors?.stats || {};
  const series = visitors?.series?.length ? visitors.series : (stats.series || []);
  const maxDaily = Math.max(
    1,
    ...series.map((d) => (d.members ?? 0) + (d.visitors ?? d.analyses ?? 0)),
    ...(stats.series || []).map((d) => d.analyses || 0),
  );

  const cards = [
    {
      label: 'Utilisateurs', value: stats.users.total, Icon: Users, tone: 'primary',
      detail: `${stats.users.new_7d} nouveau${stats.users.new_7d !== 1 ? 'x' : ''} cette semaine`,
    },
    {
      label: 'Analyses (tous publics)', value: stats.analyses.total, Icon: FileText, tone: 'accent',
      detail: `${stats.analyses.today} aujourd’hui · score moyen ${stats.analyses.avg_score}`,
    },
    {
      label: 'Analyses de visiteurs', value: v.analyses_total ?? '—', Icon: Globe, tone: 'gold',
      detail: visitors
        ? `${v.analyses_today || 0} aujourd’hui · ${v.visitors_today || 0} visiteur${(v.visitors_today || 0) !== 1 ? 's' : ''} distinct${(v.visitors_today || 0) !== 1 ? 's' : ''}`
        : 'Migration 0004/0005 requise',
    },
    {
      label: 'Actions journalisées', value: stats.logs.total, Icon: Activity, tone: 'success',
      detail: `${stats.logs.critical_7d} critique${stats.logs.critical_7d !== 1 ? 's' : ''} sur 7 jours`,
    },
  ];

  const purgeOldAnonymous = async () => {
    setPurgeBusy(true);
    try {
      const deleted = await purgeAnonymousAnalyses(null);
      toast.success(`${deleted} analyse(s) anonyme(s) supprimée(s).`, 'Conservation appliquée');
      setPurgeOpen(false);
      await load();
    } catch (err) {
      toast.error(err.message, 'Purge refusée');
    } finally {
      setPurgeBusy(false);
    }
  };

  return (
    <div className="sa-section">
      <div className="sa-section-head">
        <div>
          <h2>Vue d’ensemble</h2>
          <p>Données réelles issues de la base, rafraîchies à chaque ouverture.</p>
        </div>
        <div className="row">
          <button className="btn btn-secondary btn-sm" onClick={load}>
            <RefreshCw size={14} /> Rafraîchir
          </button>
          <button className="btn btn-primary btn-sm" onClick={checkInstallation} disabled={diagLoading}>
            {diagLoading ? <Loader2 size={14} className="spinner" /> : <Stethoscope size={14} />}
            Vérifier l’installation
          </button>
        </div>
      </div>

      {/* Cartes */}
      <div className="sa-cards">
        {cards.map((c, i) => (
          <motion.div
            key={c.label}
            className="sa-card card"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
          >
            <div className={`sa-card-icon tone-${c.tone}`}><c.Icon size={20} /></div>
            <span className="sa-card-value">{c.value}</span>
            <span className="sa-card-label">{c.label}</span>
            <span className="sa-card-detail">{c.detail}</span>
          </motion.div>
        ))}
      </div>

      {/* Diagnostic */}
      {diagnostics && (
        <motion.div
          className="card sa-diagnostics"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="sa-card-head">
            <h3><Stethoscope size={17} /> Diagnostic de l’installation</h3>
            <span className={`badge ${diagnostics.ok ? 'badge-success' : 'badge-warning'}`}>
              {diagnostics.ok ? 'Tout est opérationnel' : 'Action requise'}
            </span>
          </div>
          <ul className="sa-diag-list">
            {diagnostics.checks.map((c) => (
              <li key={c.name} className={c.ok ? 'ok' : 'ko'}>
                {c.ok ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
                <span className="sa-diag-name">{c.name}</span>
                <span className="sa-diag-detail">{c.detail}</span>
              </li>
            ))}
          </ul>
        </motion.div>
      )}

      {visitorError && (
        <div className="alert alert-warning">
          <ShieldAlert size={18} />
          <div>
            <strong>Activité des visiteurs invisible</strong>
            <p>
              {/does not exist|could not find|Fonction absente/i.test(visitorError)
                ? 'Exécutez supabase/migrations/0004_visitor_visibility.sql puis 0005_admin_visibility_fixes.sql dans le SQL Editor de Supabase. Sans ces migrations, les analyses sans compte n’apparaissent pas ici.'
                : visitorError}
            </p>
          </div>
        </div>
      )}

      <div className="sa-grid-2">
        {/* Activité */}
        <div className="card">
          <div className="sa-card-head">
            <h3><TrendingUp size={17} /> Activité des 14 derniers jours</h3>
          </div>
          <div className="sa-bars">
            {series.map((d, i) => {
              const members = d.members ?? 0;
              const visitorCount = d.visitors ?? 0;
              const total = visitors ? members + visitorCount : (d.analyses || 0);
              return (
                <div
                  key={d.day}
                  className="sa-bar-col"
                  title={
                    visitors
                      ? `${d.day} — ${members} membre(s), ${visitorCount} visiteur(s)`
                      : `${d.day} — ${total} analyse(s), ${d.signups || 0} inscription(s)`
                  }
                >
                  <div className="sa-bar-stack">
                    {visitors ? (
                      <>
                        <motion.div
                          className="sa-bar sa-bar-visitors"
                          initial={{ height: 0 }}
                          animate={{ height: `${(visitorCount / maxDaily) * 100}%` }}
                          transition={{ delay: 0.15 + i * 0.03, duration: 0.4 }}
                        />
                        <motion.div
                          className="sa-bar sa-bar-members"
                          initial={{ height: 0 }}
                          animate={{ height: `${(members / maxDaily) * 100}%` }}
                          transition={{ delay: 0.15 + i * 0.03, duration: 0.4 }}
                        />
                      </>
                    ) : (
                      <motion.div
                        className="sa-bar"
                        initial={{ height: 0 }}
                        animate={{ height: `${(total / maxDaily) * 100}%` }}
                        transition={{ delay: 0.15 + i * 0.03, duration: 0.4 }}
                      />
                    )}
                  </div>
                  <span className="sa-bar-label">{d.day.slice(8)}</span>
                </div>
              );
            })}
          </div>
          {visitors && (
            <div className="sa-bar-legend">
              <span><i className="members" /> Membres</span>
              <span><i className="visitors" /> Visiteurs sans compte</span>
            </div>
          )}
        </div>

        {/* Répartition */}
        <div className="card">
          <div className="sa-card-head"><h3>Répartition des contenus</h3></div>

          <div className="sa-breakdown">
            {[
              { label: 'Texte', value: stats.analyses.by_type.text },
              { label: 'Liens', value: stats.analyses.by_type.url },
              { label: 'Images', value: stats.analyses.by_type.image },
              { label: 'Documents', value: stats.analyses.by_type.document },
            ].map((row) => {
              const pct = stats.analyses.total
                ? Math.round((row.value / stats.analyses.total) * 100)
                : 0;
              return (
                <div key={row.label} className="sa-breakdown-row">
                  <span>{row.label}</span>
                  <div className="progress-track sa-breakdown-track">
                    <div className="progress-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <strong>{row.value}</strong>
                </div>
              );
            })}
          </div>

          <div className="divider" />

          <div className="sa-mini-stats">
            <div><Share2 size={14} /> {stats.analyses.shared} partagée{stats.analyses.shared !== 1 ? 's' : ''}</div>
            <div><Trash2 size={14} /> {stats.analyses.removed} modérée{stats.analyses.removed !== 1 ? 's' : ''}</div>
            {visitors && (
              <div>
                <Globe size={14} /> {v.visitors_last_7d || 0} visiteur{(v.visitors_last_7d || 0) !== 1 ? 's' : ''} sur 7 jours
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Visiteurs les plus actifs */}
      {visitors && (
        <div className="card">
          <div className="sa-card-head">
            <h3><Globe size={17} /> Visiteurs les plus actifs (24 h)</h3>
            {isSuperAdmin() && (
              <button className="btn btn-ghost btn-sm" onClick={() => setPurgeOpen(true)}>
                <Trash2 size={14} /> Purger les anciennes
              </button>
            )}
          </div>
          {visitors.top?.length > 0 ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Empreinte</th>
                    <th>Réseau</th>
                    <th style={{ textAlign: 'right' }}>Analyses</th>
                    <th>Dernière</th>
                  </tr>
                </thead>
                <tbody>
                  {visitors.top.map((row) => (
                    <tr key={row.visitor_hash}>
                      <td className="cell-mono">{String(row.visitor_hash || '').slice(0, 8)}</td>
                      <td className="text-muted">{row.visitor_ip_prefix || '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 650 }}>{row.analyses}</td>
                      <td className="text-muted" style={{ fontSize: '.8125rem' }}>
                        {row.last_seen
                          ? new Date(row.last_seen).toLocaleString('fr-FR', {
                            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                          })
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted" style={{ padding: '8px 4px 0' }}>
              Aucune analyse anonyme ces dernières 24 heures. Dès qu’un visiteur
              sans compte lancera une vérification, elle apparaîtra ici.
            </p>
          )}
        </div>
      )}

      {/* Utilisateurs les plus actifs */}
      {stats.top_users?.length > 0 && (
        <div className="card">
          <div className="sa-card-head">
            <h3>Utilisateurs les plus actifs (30 jours)</h3>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Utilisateur</th><th style={{ textAlign: 'right' }}>Analyses</th></tr>
              </thead>
              <tbody>
                {stats.top_users.map((u) => (
                  <tr key={u.email}>
                    <td className="cell-mono">{u.email}</td>
                    <td style={{ textAlign: 'right', fontWeight: 650 }}>{u.analyses}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={purgeOpen}
        busy={purgeBusy}
        onClose={() => setPurgeOpen(false)}
        onConfirm={purgeOldAnonymous}
        title="Purger les analyses anonymes anciennes ?"
        message="Les analyses de visiteurs plus anciennes que la durée de conservation (réglage « anonymous_retention_days ») seront définitivement supprimées. Les analyses des comptes ne sont pas touchées."
        confirmLabel="Purger"
        tone="danger"
      />
    </div>
  );
}
