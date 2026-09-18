import { useCallback, useEffect, useState } from 'react';
import {
  Search, RefreshCw, Download, Trash2, ScrollText, AlertTriangle,
  ShieldAlert, Info, TriangleAlert, ChevronDown,
} from 'lucide-react';

import * as admin from '../../services/admin';
import { toast } from '../../store/toast';
import { ConfirmDialog } from '../../components/ui/Modal';
import { exportJson } from '../../utils/export';

const PAGE_SIZE = 40;

const SEVERITY = {
  info:     { label: 'Info',     className: 'badge-secondary', Icon: Info },
  warning:  { label: 'Sensible', className: 'badge-warning',   Icon: TriangleAlert },
  critical: { label: 'Critique', className: 'badge-danger',    Icon: ShieldAlert },
};

/** Libellés lisibles pour les actions écrites par les fonctions SQL. */
const ACTION_LABELS = {
  ADMIN_USER_ROLE_CHANGED: 'Changement de rôle',
  ADMIN_USER_SUSPENDED: 'Compte suspendu',
  ADMIN_USER_REACTIVATED: 'Suspension levée',
  ADMIN_USER_QUOTA_CHANGED: 'Quota modifié',
  ADMIN_ANALYSIS_REMOVED: 'Analyse retirée',
  ADMIN_ANALYSIS_RESTORED: 'Analyse restaurée',
  ADMIN_ANALYSIS_PURGED: 'Analyse supprimée définitivement',
  ADMIN_SETTING_UPDATED: 'Paramètre modifié',
  ADMIN_BROADCAST_SENT: 'Notification diffusée',
  ADMIN_LOGS_PURGED: 'Journal purgé',
  ADMIN_USER_CREATED: 'Compte créé',
  ADMIN_USER_DELETED: 'Compte supprimé',
  ADMIN_PASSWORD_RESET_SENT: 'Réinitialisation envoyée',
  ADMIN_USER_EMAIL_CHANGED: 'Email modifié',
  ADMIN_SESSIONS_REVOKED: 'Sessions révoquées',
  ANONYMOUS_ANALYSIS: 'Analyse d’un visiteur',
  ADMIN_ANONYMOUS_PURGED: 'Analyses anonymes purgées',
};

export default function AuditTab() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [severity, setSeverity] = useState('');
  const [audience, setAudience] = useState('');
  const [expanded, setExpanded] = useState(null);

  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purgeDays, setPurgeDays] = useState(90);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => { setDebounced(search); setPage(0); }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { items, total: count } = await admin.listActivityLogs({
        search: debounced,
        severity,
        audience,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setRows(items);
      setTotal(count);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [debounced, severity, audience, page]);

  useEffect(() => { load(); }, [load]);

  const purge = async () => {
    setBusy(true);
    try {
      const deleted = await admin.purgeActivityLogs(Number(purgeDays));
      toast.success(`${deleted} entrée(s) supprimée(s).`, 'Audit purgé');
      setPurgeOpen(false);
      await load();
    } catch (err) {
      toast.error(err.message, 'Purge refusée');
    } finally {
      setBusy(false);
    }
  };

  const pageCount = Math.ceil(total / PAGE_SIZE) || 1;

  return (
    <div className="sa-section">
      <div className="sa-section-head">
        <div>
          <h2>Journal d’audit</h2>
          <p>
            Toute action d’administration, et chaque analyse lancée sans compte,
            est écrite ici. {total} entrée{total !== 1 ? 's' : ''}.
          </p>
        </div>
        <div className="row">
          <button className="btn btn-secondary btn-sm" onClick={load}>
            <RefreshCw size={14} /> Rafraîchir
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => exportJson(rows, 'audit')}
            disabled={!rows.length}
          >
            <Download size={14} /> Exporter
          </button>
          <button className="btn btn-danger btn-sm" onClick={() => setPurgeOpen(true)}>
            <Trash2 size={14} /> Purger
          </button>
        </div>
      </div>

      <div className="sa-filters">
        <div className="input-icon sa-filter-search">
          <Search size={16} />
          <input
            type="search"
            placeholder="Filtrer par action (ex. ROLE, SETTING, DELETED)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Filtrer les entrées d’audit"
          />
        </div>
        <select
          value={severity}
          onChange={(e) => { setSeverity(e.target.value); setPage(0); }}
          aria-label="Filtrer par gravité"
        >
          <option value="">Toutes gravités</option>
          <option value="info">Info</option>
          <option value="warning">Sensible</option>
          <option value="critical">Critique</option>
        </select>
        <select
          value={audience}
          onChange={(e) => { setAudience(e.target.value); setPage(0); }}
          aria-label="Filtrer par public"
        >
          <option value="">Membres et visiteurs</option>
          <option value="members">Actions d’administration</option>
          <option value="visitors">Analyses de visiteurs</option>
        </select>
      </div>

      {error && (
        <div className="alert alert-danger"><AlertTriangle size={17} /><div>{error}</div></div>
      )}

      <div className="card card-flush">
        {loading ? (
          <div className="stack" style={{ padding: 18 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 46 }} />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="empty-state" style={{ padding: 48 }}>
            <ScrollText size={32} strokeWidth={1.5} />
            <h3>Journal vide</h3>
            <p>Aucune action ne correspond à ces filtres.</p>
          </div>
        ) : (
          <ul className="sa-audit-list">
            {rows.map((row) => {
              const sev = SEVERITY[row.severity] || SEVERITY.info;
              const open = expanded === row.id;
              const hasDetails = row.details && Object.keys(row.details).length > 0;

              return (
                <li key={row.id} className={`sa-audit-item sev-${row.severity || 'info'}`}>
                  <button
                    className="sa-audit-row"
                    onClick={() => setExpanded(open ? null : row.id)}
                    aria-expanded={open}
                    disabled={!hasDetails}
                  >
                    <span className={`sa-audit-sev ${sev.className}`}><sev.Icon size={13} /></span>

                    <span className="sa-audit-main">
                      <strong>{ACTION_LABELS[row.action] || row.action}</strong>
                      <span className="sa-audit-meta">
                        {row.visitor_hash
                          ? `Visiteur ${row.visitor_hash.slice(0, 8)}${row.ip_address ? ` · ${row.ip_address}` : ''}`
                          : (row.actor?.email || row.actor_email || 'Système')}
                        {row.target_user_id && ' → cible modifiée'}
                      </span>
                    </span>

                    <span className="sa-audit-date">
                      {new Date(row.created_at).toLocaleString('fr-FR', {
                        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                      })}
                    </span>

                    {hasDetails && (
                      <ChevronDown size={15} className={`sa-audit-chevron${open ? ' is-open' : ''}`} />
                    )}
                  </button>

                  {open && hasDetails && (
                    <pre className="sa-audit-details">{JSON.stringify(row.details, null, 2)}</pre>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {pageCount > 1 && (
        <div className="sa-pagination">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setPage((p) => Math.max(p - 1, 0))}
            disabled={page === 0 || loading}
          >
            Précédent
          </button>
          <span>Page {page + 1} sur {pageCount}</span>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setPage((p) => Math.min(p + 1, pageCount - 1))}
            disabled={page >= pageCount - 1 || loading}
          >
            Suivant
          </button>
        </div>
      )}

      <ConfirmDialog
        open={purgeOpen}
        busy={busy}
        onClose={() => setPurgeOpen(false)}
        onConfirm={purge}
        title="Purger le journal d’audit ?"
        message="Les entrées plus anciennes que la durée choisie seront définitivement supprimées. La purge elle-même est journalisée."
        confirmLabel="Purger"
        tone="danger"
      >
        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor="purge-days">Conserver les entrées des derniers…</label>
          <select
            id="purge-days"
            value={purgeDays}
            onChange={(e) => setPurgeDays(e.target.value)}
          >
            <option value={7}>7 jours</option>
            <option value={30}>30 jours</option>
            <option value={90}>90 jours</option>
            <option value={365}>1 an</option>
          </select>
        </div>
      </ConfirmDialog>
    </div>
  );
}
