import { useCallback, useEffect, useState } from 'react';
import {
  Search, RefreshCw, Download, Eye, Trash2, RotateCcw, Ban, Database,
  AlertTriangle, FileText, Link2, Image as ImageIcon, FileStack, Loader2,
  UserRound, Globe,
} from 'lucide-react';

import * as admin from '../../services/admin';
import { toast } from '../../store/toast';
import Modal, { ConfirmDialog } from '../../components/ui/Modal';
import { exportCsv } from '../../utils/export';
import { getScoreClassification } from '../../utils/helpers';

const PAGE_SIZE = 25;

const TYPE_META = {
  text: { label: 'Texte', Icon: FileText },
  url: { label: 'Lien', Icon: Link2 },
  image: { label: 'Image', Icon: ImageIcon },
  document: { label: 'Document', Icon: FileStack },
};

/**
 * Colonne « Auteur ».
 *
 * Une analyse sans `user_id` vient d'un visiteur non connecté. L'IP brute
 * n'est jamais conservée : l'empreinte pseudonyme relie les analyses d'une
 * même session, et le préfixe réseau permet de repérer un abus groupé.
 */
function AuthorCell({ row }) {
  if (row.user_id) {
    return (
      <span className="sa-author">
        <UserRound size={13} />
        <span className="cell-mono">{row.author_email || 'Compte supprimé'}</span>
      </span>
    );
  }

  return (
    <span className="sa-author sa-author-visitor">
      <Globe size={13} />
      <span>
        <span className="badge badge-secondary">Visiteur</span>
        {row.visitor_hash && (
          <code
            className="sa-visitor-id"
            title={`Empreinte ${row.visitor_hash}${row.visitor_ip_prefix ? ` — réseau ${row.visitor_ip_prefix}` : ''}`}
          >
            {row.visitor_hash.slice(0, 8)}
          </code>
        )}
      </span>
    </span>
  );
}

export default function ContentTab() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [audienceFilter, setAudienceFilter] = useState('');

  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => { setDebounced(search); setPage(0); }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { items, total: count } = await admin.listAnalyses({
        search: debounced,
        type: typeFilter,
        status: statusFilter,
        audience: audienceFilter,
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
  }, [debounced, typeFilter, statusFilter, audienceFilter, page]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (row) => {
    setDetailLoading(true);
    setDetail({ ...row });
    try {
      setDetail(await admin.getAnalysisDetail(row.id));
    } catch (err) {
      toast.error(err.message, 'Détail indisponible');
    } finally {
      setDetailLoading(false);
    }
  };

  const run = async (label, fn) => {
    setBusy(true);
    try {
      await fn();
      toast.success(label);
      await load();
      setConfirm(null);
      setReason('');
    } catch (err) {
      toast.error(err.message, 'Action refusée');
    } finally {
      setBusy(false);
    }
  };

  const pageCount = Math.ceil(total / PAGE_SIZE) || 1;

  return (
    <div className="sa-section">
      <div className="sa-section-head">
        <div>
          <h2>Modération des contenus</h2>
          <p>{total} analyse{total !== 1 ? 's' : ''} enregistrée{total !== 1 ? 's' : ''} sur la plateforme.</p>
        </div>
        <div className="row">
          <button className="btn btn-secondary btn-sm" onClick={load}>
            <RefreshCw size={14} /> Rafraîchir
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => exportCsv(rows, 'analyses')}
            disabled={!rows.length}
          >
            <Download size={14} /> CSV
          </button>
        </div>
      </div>

      <div className="sa-filters">
        <div className="input-icon sa-filter-search">
          <Search size={16} />
          <input
            type="search"
            placeholder="Rechercher par contenu, verdict ou auteur…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Rechercher une analyse"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(0); }}
          aria-label="Filtrer par type"
        >
          <option value="">Tous les types</option>
          <option value="text">Texte</option>
          <option value="url">Lien</option>
          <option value="image">Image</option>
          <option value="document">Document</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
          aria-label="Filtrer par statut"
        >
          <option value="">Tous les statuts</option>
          <option value="active">Visibles</option>
          <option value="removed">Retirées</option>
        </select>
        <select
          value={audienceFilter}
          onChange={(e) => { setAudienceFilter(e.target.value); setPage(0); }}
          aria-label="Filtrer par public"
        >
          <option value="">Membres et visiteurs</option>
          <option value="members">Membres uniquement</option>
          <option value="visitors">Visiteurs uniquement</option>
        </select>
      </div>

      {error && (
        <div className="alert alert-danger"><AlertTriangle size={17} /><div>{error}</div></div>
      )}

      <div className="card card-flush">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Contenu</th>
                <th>Auteur</th>
                <th>Type</th>
                <th>Score</th>
                <th>Statut</th>
                <th>Date</th>
                <th className="cell-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`sk-${i}`}>
                    <td colSpan={7}><div className="skeleton" style={{ height: 22 }} /></td>
                  </tr>
                ))}

              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state" style={{ padding: 40 }}>
                      <Database size={32} strokeWidth={1.5} />
                      <h3>Aucune analyse</h3>
                      <p>
                        Les analyses apparaissent ici dès qu’elles sont
                        enregistrées, qu’elles viennent d’un membre ou d’un
                        visiteur non connecté.
                      </p>
                    </div>
                  </td>
                </tr>
              )}

              {!loading && rows.map((row) => {
                const meta = TYPE_META[row.type] || TYPE_META.text;
                const cls = getScoreClassification(row.score ?? 0);
                return (
                  <tr key={row.id} className={row.is_removed ? 'sa-row-removed' : ''}>
                    <td>
                      <span className="sa-content-input" title={row.input}>
                        {row.file_name || row.input}
                      </span>
                    </td>
                    <td><AuthorCell row={row} /></td>
                    <td>
                      <span className="badge badge-secondary">
                        <meta.Icon size={12} /> {meta.label}
                      </span>
                    </td>
                    <td>
                      {row.score === null
                        ? <span className="text-muted">–</span>
                        : <span className={`badge ${cls.class}`}>{row.score}</span>}
                    </td>
                    <td>
                      <span className={`badge ${row.is_removed ? 'badge-danger' : 'badge-success'}`}>
                        {row.is_removed ? 'Retirée' : 'Visible'}
                      </span>
                      {row.is_public && <span className="badge badge-info" style={{ marginLeft: 5 }}>Publique</span>}
                    </td>
                    <td className="text-muted" style={{ fontSize: '.8125rem' }}>
                      {new Date(row.created_at).toLocaleDateString('fr-FR', {
                        day: '2-digit', month: '2-digit', year: '2-digit',
                      })}
                    </td>
                    <td className="cell-actions">
                      <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                        <button
                          className="btn btn-ghost btn-icon"
                          onClick={() => openDetail(row)}
                          title="Voir le détail"
                          aria-label="Voir le détail"
                        >
                          <Eye size={15} />
                        </button>

                        {row.is_removed ? (
                          <button
                            className="btn btn-ghost btn-icon"
                            title="Restaurer"
                            aria-label="Restaurer"
                            onClick={() =>
                              run('Analyse restaurée.', () => admin.moderateAnalysis(row.id, false))
                            }
                          >
                            <RotateCcw size={15} />
                          </button>
                        ) : (
                          <button
                            className="btn btn-ghost btn-icon"
                            title="Retirer"
                            aria-label="Retirer"
                            onClick={() =>
                              setConfirm({
                                kind: 'remove',
                                row,
                                title: 'Retirer cette analyse ?',
                                message:
                                  'Elle disparaîtra de l’historique de son auteur et son lien public sera désactivé. L’opération est réversible.',
                                confirmLabel: 'Retirer',
                                tone: 'warning',
                              })
                            }
                          >
                            <Ban size={15} />
                          </button>
                        )}

                        <button
                          className="btn btn-ghost btn-icon sa-danger-icon"
                          title="Supprimer définitivement"
                          aria-label="Supprimer définitivement"
                          onClick={() =>
                            setConfirm({
                              kind: 'purge',
                              row,
                              title: 'Supprimer définitivement ?',
                              message:
                                'Cette analyse sera effacée de la base sans possibilité de restauration.',
                              confirmLabel: 'Supprimer définitivement',
                              tone: 'danger',
                            })
                          }
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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

      {/* Détail */}
      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title="Détail de l’analyse"
        description={
          detail?.author_email
            || (detail?.visitor_hash ? `Visiteur ${detail.visitor_hash.slice(0, 8)}` : undefined)
        }
        size="lg"
      >
        {detailLoading ? (
          <div className="sa-loading"><Loader2 size={26} className="spinner" /><p>Chargement…</p></div>
        ) : detail ? (
          <div className="stack">
            <div className="sa-detail-grid">
              <div><span>Type</span><strong>{TYPE_META[detail.type]?.label || detail.type}</strong></div>
              <div><span>Score</span><strong>{detail.score ?? '–'}/100</strong></div>
              <div><span>Verdict</span><strong>{detail.verdict || '–'}</strong></div>
              <div>
                <span>Créée le</span>
                <strong>{new Date(detail.created_at).toLocaleString('fr-FR')}</strong>
              </div>
              {detail.file_name && (
                <div><span>Fichier</span><strong>{detail.file_name}</strong></div>
              )}
              {detail.extraction_method && (
                <div><span>Extraction</span><strong>{detail.extraction_method}</strong></div>
              )}
              {detail.extraction_confidence !== null && detail.extraction_confidence !== undefined && (
                <div>
                  <span>Fiabilité OCR</span>
                  <strong>{Math.round(detail.extraction_confidence)}%</strong>
                </div>
              )}
              {detail.page_count && (
                <div><span>Pages</span><strong>{detail.page_count}</strong></div>
              )}
              {!detail.user_id && (
                <>
                  <div>
                    <span>Visiteur</span>
                    <strong className="cell-mono">{detail.visitor_hash?.slice(0, 12) || '—'}</strong>
                  </div>
                  {detail.visitor_ip_prefix && (
                    <div><span>Réseau</span><strong>{detail.visitor_ip_prefix}</strong></div>
                  )}
                </>
              )}
            </div>

            {!detail.user_id && detail.user_agent && (
              <div className="field">
                <label>Navigateur</label>
                <div className="sa-detail-box">{detail.user_agent}</div>
              </div>
            )}

            <div className="field">
              <label>Contenu soumis</label>
              <div className="sa-detail-box">{detail.input}</div>
            </div>

            {detail.extracted_text && (
              <div className="field">
                <label>Texte extrait du fichier</label>
                <div className="sa-detail-box sa-detail-scroll">{detail.extracted_text}</div>
              </div>
            )}

            {detail.result?.detailedConclusion && (
              <div className="field">
                <label>Conclusion de l’analyse</label>
                <div className="sa-detail-box sa-detail-scroll">{detail.result.detailedConclusion}</div>
              </div>
            )}

            {detail.removal_reason && (
              <div className="alert alert-warning">
                <AlertTriangle size={16} />
                <div>Motif de retrait : {detail.removal_reason}</div>
              </div>
            )}
          </div>
        ) : null}
      </Modal>

      {/* Confirmation avec motif */}
      <ConfirmDialog
        open={Boolean(confirm)}
        busy={busy}
        onClose={() => { setConfirm(null); setReason(''); }}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        tone={confirm?.tone}
        onConfirm={() =>
          confirm.kind === 'purge'
            ? run('Analyse supprimée définitivement.', () => admin.purgeAnalysis(confirm.row.id))
            : run('Analyse retirée.', () =>
                admin.moderateAnalysis(confirm.row.id, true, reason || null)
              )
        }
      >
        {confirm?.kind === 'remove' && (
          <div className="field" style={{ marginTop: 14 }}>
            <label htmlFor="removal-reason">Motif (facultatif, conservé dans l’audit)</label>
            <input
              id="removal-reason"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Contenu haineux, spam, doublon…"
            />
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}
