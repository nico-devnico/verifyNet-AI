import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Search, Trash2, FileText, Link2, Image as ImageIcon, FileStack,
  ExternalLink, Share2, Check, Copy, Inbox, CloudOff,
} from 'lucide-react';

import useStore from '../store';
import {
  listMyAnalyses, deleteAnalysis, deleteAllMyAnalyses, toggleSharing,
} from '../services/analyses';
import { toast } from '../store/toast';
import { ConfirmDialog } from '../components/ui/Modal';
import { getScoreClassification, formatDate, truncate } from '../utils/helpers';
import './History.css';

const PAGE_SIZE = 20;

const TYPE_META = {
  text: { label: 'Texte', Icon: FileText },
  url: { label: 'Lien', Icon: Link2 },
  image: { label: 'Image', Icon: ImageIcon },
  document: { label: 'Document', Icon: FileStack },
};

const FILTERS = [
  { id: 'all', label: 'Tout' },
  { id: 'text', label: 'Texte' },
  { id: 'url', label: 'Liens' },
  { id: 'image', label: 'Images' },
  { id: 'document', label: 'Documents' },
];

const RELIABILITY = [
  { id: 'all', label: 'Tous les scores' },
  { id: 'reliable', label: 'Crédible (61+)' },
  { id: 'uncertain', label: 'À vérifier (41–60)' },
  { id: 'doubtful', label: 'Douteux (< 41)' },
];

export default function History() {
  const navigate = useNavigate();
  const {
    user, localHistory, removeLocalAnalysis, clearLocalHistory,
    setCurrentAnalysis, setIsAnalyzing, settingBool,
  } = useStore();

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(Boolean(user));
  const [loadError, setLoadError] = useState('');

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [type, setType] = useState('all');
  const [reliability, setReliability] = useState('all');

  const [confirm, setConfirm] = useState(null); // { kind: 'one'|'all', id? }
  const [busy, setBusy] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  const sharingEnabled = settingBool('enable_public_sharing', true);

  /* Anti-rebond : évite une requête par frappe. */
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setLoadError('');
    try {
      const { items: rows, total: count } = await listMyAnalyses({
        search: debouncedSearch,
        type,
        reliability,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setItems(rows);
      setTotal(count);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user, debouncedSearch, type, reliability, page]);

  useEffect(() => {
    load();
  }, [load]);

  /* Historique local pour les visiteurs non connectés. */
  const localFiltered = useMemo(() => {
    if (user) return [];
    let rows = localHistory;
    const q = debouncedSearch.trim().toLowerCase();
    if (q) rows = rows.filter((r) => r.input?.toLowerCase().includes(q));
    if (type !== 'all') rows = rows.filter((r) => r.type === type);
    if (reliability === 'reliable') rows = rows.filter((r) => r.score >= 61);
    else if (reliability === 'uncertain') rows = rows.filter((r) => r.score >= 41 && r.score <= 60);
    else if (reliability === 'doubtful') rows = rows.filter((r) => r.score < 41);
    return rows;
  }, [user, localHistory, debouncedSearch, type, reliability]);

  const rows = user ? items : localFiltered;
  const displayedTotal = user ? total : localFiltered.length;

  const openAnalysis = (row) => {
    if (!row.result) {
      toast.info('Le détail complet de cette analyse n’est pas disponible.');
      return;
    }
    setIsAnalyzing(false);
    setCurrentAnalysis(row.result);
    navigate('/analyze');
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      if (confirm.kind === 'all') {
        if (user) await deleteAllMyAnalyses(user.id);
        else clearLocalHistory();
        toast.success('Historique effacé.');
      } else if (user) {
        await deleteAnalysis(confirm.id);
        toast.success('Analyse supprimée.');
      } else {
        removeLocalAnalysis(confirm.id);
        toast.success('Analyse supprimée.');
      }
      setConfirm(null);
      if (user) await load();
    } catch (err) {
      toast.error(err.message, 'Suppression impossible');
    } finally {
      setBusy(false);
    }
  };

  const handleShare = async (row) => {
    try {
      const updated = await toggleSharing(row.id, !row.is_public);
      if (updated?.share_slug) {
        const link = `${window.location.origin}/r/${updated.share_slug}`;
        await navigator.clipboard.writeText(link).catch(() => {});
        setCopiedId(row.id);
        setTimeout(() => setCopiedId(null), 2200);
        toast.success('Lien de partage copié dans le presse-papiers.', 'Rapport partagé');
      } else {
        toast.info('Le partage de ce rapport a été désactivé.');
      }
      await load();
    } catch (err) {
      toast.error(err.message, 'Partage impossible');
    }
  };

  const pageCount = Math.ceil(displayedTotal / PAGE_SIZE) || 1;
  const hasFilters = debouncedSearch || type !== 'all' || reliability !== 'all';

  return (
    <div className="history-page">
      <div className="container">
        <motion.div className="page-header" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
          <h1>Vos analyses</h1>
          <p>
            {displayedTotal} vérification{displayedTotal !== 1 ? 's' : ''}
            {user ? ' enregistrée' : ' en local'}
            {displayedTotal !== 1 && user ? 's' : ''}
          </p>
        </motion.div>

        {!user && (
          <div className="alert alert-info history-local-notice">
            <CloudOff size={17} />
            <div>
              Vous n’êtes pas connecté : cet historique est stocké dans ce navigateur
              uniquement et sera perdu si vous videz vos données.
            </div>
          </div>
        )}

        <div className="history-controls">
          <div className="input-icon history-search">
            <Search size={16} />
            <input
              type="search"
              placeholder="Rechercher dans vos analyses…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Rechercher dans l'historique"
            />
          </div>

          <div className="history-filters">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                className={`chip ${type === f.id ? 'active' : ''}`}
                onClick={() => { setType(f.id); setPage(0); }}
              >
                {f.label}
              </button>
            ))}
          </div>

          <select
            className="history-select"
            value={reliability}
            onChange={(e) => { setReliability(e.target.value); setPage(0); }}
            aria-label="Filtrer par score"
          >
            {RELIABILITY.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>

          {displayedTotal > 0 && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setConfirm({ kind: 'all' })}
            >
              <Trash2 size={15} />
              Tout effacer
            </button>
          )}
        </div>

        {loadError && (
          <div className="alert alert-danger">
            <span>{loadError}</span>
          </div>
        )}

        {loading && (
          <div className="history-list">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton history-skeleton" />
            ))}
          </div>
        )}

        {!loading && rows.length === 0 && (
          <div className="empty-state card">
            <Inbox size={42} strokeWidth={1.5} />
            <h3>{hasFilters ? 'Aucun résultat' : 'Aucune analyse pour le moment'}</h3>
            <p>
              {hasFilters
                ? 'Essayez d’élargir votre recherche ou de retirer les filtres actifs.'
                : 'Lancez votre première vérification pour la retrouver ici.'}
            </p>
            {!hasFilters && (
              <button className="btn btn-primary" onClick={() => navigate('/analyze')}>
                Analyser une information
              </button>
            )}
          </div>
        )}

        {!loading && rows.length > 0 && (
          <div className="history-list">
            {rows.map((row, i) => {
              const cls = getScoreClassification(row.score ?? 0);
              const meta = TYPE_META[row.type] || TYPE_META.text;
              return (
                <motion.div
                  key={row.id}
                  className="history-item card card-hover"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.3) }}
                >
                  <button
                    className="history-item-main"
                    onClick={() => openAnalysis(row)}
                    aria-label={`Ouvrir l'analyse : ${truncate(row.input, 60)}`}
                  >
                    <span className={`badge ${cls.class} history-score`}>
                      {row.score ?? '–'}<small>/100</small>
                    </span>

                    <span className="history-item-body">
                      <span className="history-input">{truncate(row.input, 110)}</span>
                      <span className="history-meta">
                        <span className="history-type">
                          <meta.Icon size={13} />
                          {meta.label}
                        </span>
                        <span>·</span>
                        <span>{formatDate(row.created_at)}</span>
                        {row.verdict && (
                          <>
                            <span>·</span>
                            <span>{row.verdict}</span>
                          </>
                        )}
                        {row.is_public && (
                          <span className="badge badge-info history-shared-badge">Partagé</span>
                        )}
                      </span>
                    </span>

                    <ExternalLink size={16} className="history-open-icon" />
                  </button>

                  <div className="history-item-actions">
                    {user && sharingEnabled && (
                      <button
                        className="btn btn-ghost btn-icon"
                        onClick={() => handleShare(row)}
                        title={row.is_public ? 'Désactiver le partage' : 'Partager par lien'}
                        aria-label={row.is_public ? 'Désactiver le partage' : 'Partager par lien'}
                      >
                        {copiedId === row.id ? <Check size={16} /> : row.is_public ? <Copy size={16} /> : <Share2 size={16} />}
                      </button>
                    )}
                    <button
                      className="btn btn-ghost btn-icon history-delete"
                      onClick={() => setConfirm({ kind: 'one', id: row.id })}
                      title="Supprimer"
                      aria-label="Supprimer cette analyse"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {user && pageCount > 1 && (
          <div className="history-pagination">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setPage((p) => Math.max(p - 1, 0))}
              disabled={page === 0 || loading}
            >
              Précédent
            </button>
            <span>
              Page {page + 1} sur {pageCount}
            </span>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setPage((p) => Math.min(p + 1, pageCount - 1))}
              disabled={page >= pageCount - 1 || loading}
            >
              Suivant
            </button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={handleDelete}
        busy={busy}
        title={confirm?.kind === 'all' ? 'Effacer tout l’historique ?' : 'Supprimer cette analyse ?'}
        message={
          confirm?.kind === 'all'
            ? `Vos ${displayedTotal} analyses seront définitivement supprimées. Cette action est irréversible.`
            : 'Cette analyse sera définitivement supprimée. Cette action est irréversible.'
        }
        confirmLabel={confirm?.kind === 'all' ? 'Tout effacer' : 'Supprimer'}
      />
    </div>
  );
}
