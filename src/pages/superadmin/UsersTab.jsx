import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Search, UserPlus, Download, RefreshCw, Crown, Shield, User as UserIcon,
  Ban, CheckCircle2, KeyRound, Mail, Trash2, LogOut, Gauge, SlidersHorizontal,
  AlertTriangle, Loader2,
} from 'lucide-react';

import * as admin from '../../services/admin';
import useStore from '../../store';
import { toast } from '../../store/toast';
import Modal, { ConfirmDialog } from '../../components/ui/Modal';
import { exportCsv, exportJson } from '../../utils/export';

const PAGE_SIZE = 25;

const ROLE_META = {
  super_admin: { label: 'Super admin', icon: Crown, className: 'badge-gold' },
  admin: { label: 'Administrateur', icon: Shield, className: 'badge-info' },
  user: { label: 'Utilisateur', icon: UserIcon, className: 'badge-secondary' },
};

export default function UsersTab() {
  const { user: currentUser, profile } = useStore();

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [authInfo, setAuthInfo] = useState({});
  const [serviceRoleAvailable, setServiceRoleAvailable] = useState(true);
  const [orphans, setOrphans] = useState([]);

  const [manage, setManage] = useState(null);     // utilisateur en cours de gestion
  const [confirm, setConfirm] = useState(null);   // { action, user, … }
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  /* Recherche : debounce, sans retarder le tout premier chargement (debounced vaut déjà ''). */
  useEffect(() => {
    if (search === debounced) return undefined;
    const timer = setTimeout(() => { setDebounced(search); setPage(0); }, 350);
    return () => clearTimeout(timer);
  }, [search, debounced]);

  /** Liste des profils via RPC Supabase — affichée immédiatement. */
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { items, total: count } = await admin.listUsers({
        search: debounced,
        role: roleFilter,
        status: statusFilter,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setRows(items || []);
      setTotal(count || 0);
    } catch (err) {
      setError(err.message);
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [debounced, roleFilter, statusFilter, page]);

  useEffect(() => {
    load();
  }, [load, profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Enrichissement Auth en arrière-plan (dernière connexion, emails, orphelins).
   * Ne bloque jamais l’affichage de la liste.
   */
  const refreshAuth = useCallback(async () => {
    try {
      const { users, orphans: ghostProfiles } = await admin.fetchAuthInfo();
      const byId = Object.fromEntries((users || []).map((u) => [u.id, u]));
      setAuthInfo(byId);
      setServiceRoleAvailable(true);
      if (Array.isArray(ghostProfiles)) setOrphans(ghostProfiles);
      setRows((prev) => prev.map((row) => {
        const auth = byId[row.id];
        return auth?.email && auth.email !== row.email
          ? { ...row, email: auth.email }
          : row;
      }));
    } catch (err) {
      if (err.code === 'SERVICE_ROLE_MISSING') setServiceRoleAvailable(false);
    }
  }, []);

  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

  /* Garde l'utilisateur affiché dans la fenêtre de gestion synchronisé. */
  const manageRow = useMemo(
    () => (manage ? rows.find((r) => r.id === manage.id) || manage : null),
    [manage, rows]
  );

  /** Exécute une action, affiche le résultat, recharge la liste. */
  const run = async (label, fn, { closeManage = false } = {}) => {
    setBusy(true);
    try {
      await fn();
      toast.success(label);
      await load();
      await refreshAuth();
      setConfirm(null);
      if (closeManage) setManage(null);
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
          <h2>Gestion des utilisateurs</h2>
          <p>{total} compte{total !== 1 ? 's' : ''} — rôles, suspensions et quotas appliqués en base.</p>
        </div>
        <div className="row">
          <button
            className="btn btn-secondary btn-sm"
            onClick={async () => { await load(); await refreshAuth(); }}
          >
            <RefreshCw size={14} /> Rafraîchir
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => exportCsv(rows, 'utilisateurs')}
            disabled={!rows.length}
          >
            <Download size={14} /> CSV
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
            <UserPlus size={14} /> Nouveau compte
          </button>
        </div>
      </div>

      {!serviceRoleAvailable && (
        <div className="alert alert-warning">
          <AlertTriangle size={17} />
          <div>
            <strong>Clé service_role absente.</strong>
            <p>
              Les rôles, suspensions et quotas fonctionnent normalement. En revanche la
              création de compte, la suppression définitive, le changement d’email et la
              réinitialisation de mot de passe nécessitent
              <code> SUPABASE_SERVICE_ROLE_KEY </code>
              dans <code>server/.env</code>.
            </p>
          </div>
        </div>
      )}

      {orphans.length > 0 && (
        <div className="alert alert-warning">
          <AlertTriangle size={17} />
          <div>
            <strong>
              {orphans.length} compte{orphans.length > 1 ? 's' : ''} fantôme
              {orphans.length > 1 ? 's' : ''}
            </strong>
            <p>
              Présent{orphans.length > 1 ? 's' : ''} dans la table <code>profiles</code> mais
              absent{orphans.length > 1 ? 's' : ''} d’Authentication (
              {orphans.slice(0, 4).map((o) => o.email).join(', ')}
              {orphans.length > 4 ? ` et ${orphans.length - 4} autre(s)` : ''}).
              Ils n’apparaissent plus dans la liste ci-dessous.
            </p>
            <button
              className="btn btn-secondary btn-sm"
              style={{ marginTop: 10 }}
              disabled={busy}
              onClick={() =>
                setConfirm({
                  title: 'Supprimer les comptes fantômes ?',
                  message:
                    `${orphans.length} profil(s) sans compte Auth seront retirés de la base. ` +
                    'Les analyses associées à ces profils seront également supprimées.',
                  confirmLabel: 'Nettoyer',
                  onConfirm: () =>
                    run(
                      `${orphans.length} profil(s) orphelin(s) supprimé(s).`,
                      () => admin.purgeOrphanProfiles()
                    ),
                })
              }
            >
              <Trash2 size={14} /> Nettoyer la base
            </button>
          </div>
        </div>
      )}

      {/* Filtres */}
      <div className="sa-filters">
        <div className="input-icon sa-filter-search">
          <Search size={16} />
          <input
            type="search"
            placeholder="Rechercher par email ou nom…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Rechercher un utilisateur"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setPage(0); }}
          aria-label="Filtrer par rôle"
        >
          <option value="">Tous les rôles</option>
          <option value="user">Utilisateurs</option>
          <option value="admin">Administrateurs</option>
          <option value="super_admin">Super administrateurs</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
          aria-label="Filtrer par statut"
        >
          <option value="">Tous les statuts</option>
          <option value="active">Actifs</option>
          <option value="suspended">Suspendus</option>
        </select>
      </div>

      {error && (
        <div className="alert alert-danger">
          <AlertTriangle size={17} /><div>{error}</div>
        </div>
      )}

      {/* Tableau */}
      <div className="card card-flush">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Utilisateur</th>
                <th>Rôle</th>
                <th>Statut</th>
                <th>Analyses</th>
                <th>Quota</th>
                <th>Dernière activité</th>
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
                      <UserIcon size={32} strokeWidth={1.5} />
                      <h3>Aucun utilisateur trouvé</h3>
                      <p>Ajustez vos filtres ou créez un premier compte.</p>
                    </div>
                  </td>
                </tr>
              )}

              {!loading && rows.map((row) => {
                const role = ROLE_META[row.role] || ROLE_META.user;
                const auth = authInfo[row.id];
                const lastSeen = row.last_seen_at || auth?.last_sign_in_at;
                const email = auth?.email || row.email;

                return (
                  <tr key={row.id} className={row.is_root ? 'sa-row-root' : ''}>
                    <td>
                      <div className="sa-user-cell">
                        <span className="sa-user-avatar">
                          {row.email?.charAt(0).toUpperCase()}
                        </span>
                        <span>
                          <strong>{email}</strong>
                          <small>
                            {[row.first_name, row.last_name].filter(Boolean).join(' ') ||
                              row.username ||
                              'Nom non renseigné'}
                            {row.is_root && ' · compte racine protégé'}
                          </small>
                        </span>
                      </div>
                    </td>

                    <td>
                      <span className={`badge ${role.className}`}>
                        <role.icon size={12} />
                        {role.label}
                      </span>
                    </td>

                    <td>
                      <span className={`badge ${row.is_suspended ? 'badge-danger' : 'badge-success'}`}>
                        {row.is_suspended ? 'Suspendu' : 'Actif'}
                      </span>
                    </td>

                    <td>
                      <span title={`${row.analyses_today} aujourd’hui`}>
                        {row.analyses_count}
                      </span>
                    </td>

                    <td>
                      {row.daily_quota_override === null
                        ? <span className="text-muted">Global</span>
                        : <strong>{row.daily_quota_override}/j</strong>}
                    </td>

                    <td className="text-muted" style={{ fontSize: '.8125rem' }}>
                      {lastSeen
                        ? new Date(lastSeen).toLocaleDateString('fr-FR', {
                            day: '2-digit', month: '2-digit', year: '2-digit',
                          })
                        : 'Jamais'}
                    </td>

                    <td className="cell-actions">
                      {row.is_root ? (
                        <span className="badge badge-gold">Protégé</span>
                      ) : (
                        <button className="btn btn-secondary btn-sm" onClick={() => setManage(row)}>
                          <SlidersHorizontal size={13} /> Gérer
                        </button>
                      )}
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

      <button
        className="btn btn-ghost btn-sm sa-export-all"
        onClick={() => exportJson(rows, 'utilisateurs')}
        disabled={!rows.length}
      >
        <Download size={14} /> Exporter cette page en JSON
      </button>

      {/* Fenêtre de gestion */}
      <ManageUserModal
        row={manageRow}
        currentUserId={currentUser?.id}
        serviceRoleAvailable={serviceRoleAvailable}
        busy={busy}
        onClose={() => setManage(null)}
        onAction={run}
        onConfirm={setConfirm}
      />

      {/* Création de compte */}
      <CreateUserModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={async () => { setCreateOpen(false); await load(); await refreshAuth(); }}
      />

      {/* Confirmations destructives */}
      <ConfirmDialog
        open={Boolean(confirm)}
        busy={busy}
        onClose={() => setConfirm(null)}
        onConfirm={confirm?.onConfirm}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        tone={confirm?.tone || 'danger'}
      />
    </div>
  );
}

/* ========================================================================== */
/* Fenêtre de gestion d'un utilisateur                                        */
/* ========================================================================== */

function ManageUserModal({
  row, currentUserId, serviceRoleAvailable, busy, onClose, onAction, onConfirm,
}) {
  const [quota, setQuota] = useState('');
  const [reason, setReason] = useState('');
  const [newEmail, setNewEmail] = useState('');

  useEffect(() => {
    if (row) {
      setQuota(row.daily_quota_override ?? '');
      setReason(row.suspension_reason ?? '');
      setNewEmail('');
    }
  }, [row]);

  if (!row) return null;

  const isSelf = row.id === currentUserId;

  return (
    <Modal
      open={Boolean(row)}
      onClose={busy ? undefined : onClose}
      title={row.email}
      description={`Compte créé le ${new Date(row.created_at).toLocaleDateString('fr-FR')} · ${row.analyses_count} analyse(s)`}
      size="md"
    >
      <div className="sa-manage">
        {/* Rôle */}
        <section className="sa-manage-block">
          <h4><Shield size={15} /> Rôle</h4>
          <p className="field-hint">
            Détermine l’accès aux pages d’administration et l’exemption de quota.
          </p>
          <div className="sa-manage-row">
            <select
              value={row.role}
              onChange={(e) =>
                onAction(`Rôle mis à jour : ${e.target.value}.`, () =>
                  admin.setUserRole(row.id, e.target.value)
                )
              }
              disabled={busy || isSelf}
            >
              <option value="user">Utilisateur</option>
              <option value="admin">Administrateur</option>
              <option value="super_admin">Super administrateur</option>
            </select>
          </div>
          {isSelf && (
            <p className="field-hint">Vous ne pouvez pas modifier votre propre rôle.</p>
          )}
        </section>

        {/* Suspension */}
        <section className="sa-manage-block">
          <h4>{row.is_suspended ? <CheckCircle2 size={15} /> : <Ban size={15} />} Suspension</h4>
          <p className="field-hint">
            Un compte suspendu ne peut plus lancer d’analyse : les politiques RLS bloquent
            l’écriture et l’utilisateur est déconnecté à sa prochaine action.
          </p>

          {row.is_suspended ? (
            <>
              {row.suspension_reason && (
                <div className="alert alert-danger" style={{ marginBottom: 10 }}>
                  <span>Motif actuel : {row.suspension_reason}</span>
                </div>
              )}
              <button
                className="btn btn-success btn-sm"
                disabled={busy}
                onClick={() =>
                  onAction('Compte réactivé.', () => admin.setUserSuspension(row.id, false))
                }
              >
                <CheckCircle2 size={14} /> Réactiver le compte
              </button>
            </>
          ) : (
            <div className="sa-manage-row">
              <input
                type="text"
                placeholder="Motif de la suspension (visible par l’utilisateur)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={busy || isSelf}
              />
              <button
                className="btn btn-danger btn-sm"
                disabled={busy || isSelf}
                onClick={() =>
                  onConfirm({
                    title: 'Suspendre ce compte ?',
                    message: `${row.email} ne pourra plus lancer d’analyse et recevra une notification dans l’application.`,
                    confirmLabel: 'Suspendre',
                    onConfirm: () =>
                      onAction('Compte suspendu.', async () => {
                        await admin.setUserSuspension(row.id, true, reason || null);
                        if (serviceRoleAvailable) {
                          await admin.revokeSessions(row.id).catch(() => {});
                        }
                      }),
                  })
                }
              >
                <Ban size={14} /> Suspendre
              </button>
            </div>
          )}
        </section>

        {/* Quota */}
        <section className="sa-manage-block">
          <h4><Gauge size={15} /> Quota journalier personnalisé</h4>
          <p className="field-hint">
            Laissez vide pour appliquer le quota global défini dans les paramètres système.
          </p>
          <div className="sa-manage-row">
            <input
              type="number"
              min="0"
              placeholder="Quota global"
              value={quota}
              onChange={(e) => setQuota(e.target.value)}
              disabled={busy}
            />
            <button
              className="btn btn-secondary btn-sm"
              disabled={busy}
              onClick={() =>
                onAction('Quota mis à jour.', () =>
                  admin.setUserQuota(row.id, quota === '' ? null : Number(quota))
                )
              }
            >
              Appliquer
            </button>
          </div>
        </section>

        <div className="divider" />

        {/* Opérations sur le compte d'authentification */}
        <section className="sa-manage-block">
          <h4><KeyRound size={15} /> Compte d’authentification</h4>
          {!serviceRoleAvailable ? (
            <p className="field-hint">
              Indisponible sans la clé <code>service_role</code>.
            </p>
          ) : (
            <>
              <div className="sa-manage-actions">
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={busy}
                  onClick={() =>
                    onAction('Email de réinitialisation envoyé.', () =>
                      admin.sendPasswordReset(row.id)
                    )
                  }
                >
                  <KeyRound size={14} /> Envoyer un lien de réinitialisation
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={busy}
                  onClick={() =>
                    onAction('Sessions révoquées.', () => admin.revokeSessions(row.id))
                  }
                >
                  <LogOut size={14} /> Révoquer les sessions
                </button>
              </div>

              <div className="sa-manage-row" style={{ marginTop: 12 }}>
                <input
                  type="email"
                  placeholder="Nouvelle adresse email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  disabled={busy}
                />
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={busy || !newEmail}
                  onClick={() =>
                    onAction('Email modifié.', () => admin.changeUserEmail(row.id, newEmail.trim()))
                  }
                >
                  <Mail size={14} /> Modifier
                </button>
              </div>
            </>
          )}
        </section>

        {/* Suppression */}
        <section className="sa-manage-block sa-manage-danger">
          <h4><Trash2 size={15} /> Zone dangereuse</h4>
          <p className="field-hint">
            La suppression retire le compte de <code>auth.users</code>. Son profil, ses
            analyses et ses fichiers sont supprimés en cascade. Action irréversible.
          </p>
          <button
            className="btn btn-danger btn-sm"
            disabled={busy || isSelf || !serviceRoleAvailable}
            onClick={() =>
              onConfirm({
                title: 'Supprimer définitivement ce compte ?',
                message: `${row.email}, son profil et ses ${row.analyses_count} analyse(s) seront effacés sans possibilité de restauration.`,
                confirmLabel: 'Supprimer définitivement',
                onConfirm: () =>
                  onAction('Compte supprimé.', () => admin.deleteUser(row.id), { closeManage: true }),
              })
            }
          >
            <Trash2 size={14} /> Supprimer le compte
          </button>
          {isSelf && <p className="field-hint">Vous ne pouvez pas supprimer votre propre compte.</p>}
        </section>
      </div>
    </Modal>
  );
}

/* ========================================================================== */
/* Création d'un compte                                                       */
/* ========================================================================== */

function CreateUserModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({ email: '', password: '', role: 'user', sendInvite: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setForm({ email: '', password: '', role: 'user', sendInvite: false });
      setError('');
    }
  }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await admin.createUser(form);
      toast.success(
        result.invited
          ? `Invitation envoyée à ${form.email}.`
          : `Compte ${form.email} créé.`,
        'Utilisateur ajouté'
      );
      await onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title="Créer un compte"
      description="Le compte est créé directement dans Supabase Auth."
      size="sm"
    >
      <form onSubmit={submit} className="stack">
        {error && (
          <div className="alert alert-danger">
            <AlertTriangle size={16} /><div>{error}</div>
          </div>
        )}

        <div className="field">
          <label htmlFor="new-email">Adresse email</label>
          <input
            id="new-email"
            type="email"
            required
            data-autofocus
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="personne@exemple.com"
          />
        </div>

        <div className="field">
          <label htmlFor="new-role">Rôle initial</label>
          <select
            id="new-role"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          >
            <option value="user">Utilisateur</option>
            <option value="admin">Administrateur</option>
            <option value="super_admin">Super administrateur</option>
          </select>
        </div>

        <label className="sa-checkbox">
          <input
            type="checkbox"
            checked={form.sendInvite}
            onChange={(e) => setForm({ ...form, sendInvite: e.target.checked })}
          />
          <span>
            Envoyer une invitation par email
            <small>L’utilisateur choisit lui-même son mot de passe.</small>
          </span>
        </label>

        {!form.sendInvite && (
          <div className="field">
            <label htmlFor="new-password">Mot de passe provisoire</label>
            <input
              id="new-password"
              type="text"
              required
              minLength={8}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="8 caractères minimum"
            />
            <span className="field-hint">
              Communiquez-le à l’utilisateur, qui pourra le changer ensuite.
            </span>
          </div>
        )}

        <div className="row" style={{ justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Annuler
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? <Loader2 size={15} className="spinner" /> : <UserPlus size={15} />}
            Créer le compte
          </button>
        </div>
      </form>
    </Modal>
  );
}
