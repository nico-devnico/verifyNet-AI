import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshCw, Save, Check, AlertTriangle, Lock, Loader2, RotateCcw,
  Settings2, ShieldCheck, Gauge, Sparkles,
} from 'lucide-react';

import * as admin from '../../services/admin';
import useStore from '../../store';
import { toast } from '../../store/toast';
import { ConfirmDialog } from '../../components/ui/Modal';

const CATEGORIES = [
  { id: 'general',  label: 'Général',      Icon: Settings2,   hint: 'Identité de la plateforme et mode maintenance.' },
  { id: 'security', label: 'Sécurité',     Icon: ShieldCheck, hint: 'Inscriptions, accès anonyme, vérification email.' },
  { id: 'limits',   label: 'Limites',      Icon: Gauge,       hint: 'Quotas et tailles maximales acceptées.' },
  { id: 'features', label: 'Fonctionnalités', Icon: Sparkles, hint: 'Activez ou coupez une fonctionnalité pour tous.' },
];

/** Réglages dont la bascule a un effet immédiat et visible pour tout le monde. */
const SENSITIVE = {
  maintenance_mode: {
    on: 'Activer le mode maintenance ?',
    message:
      'L’application deviendra inaccessible aux utilisateurs non administrateurs, ' +
      'et le serveur refusera toute nouvelle analyse. Vous garderez l’accès.',
  },
  enable_registrations: {
    off: 'Fermer les inscriptions ?',
    message:
      'Plus aucun nouveau compte ne pourra être créé, ni depuis le formulaire ' +
      'd’inscription ni via l’API. Les comptes existants ne sont pas affectés.',
  },
  allow_anonymous_analysis: {
    off: 'Interdire l’analyse anonyme ?',
    message:
      'Les visiteurs non connectés ne pourront plus lancer d’analyse : ' +
      'le serveur leur répondra qu’une authentification est requise.',
  },
  log_anonymous_analyses: {
    off: 'Arrêter d’enregistrer les analyses des visiteurs ?',
    message:
      'Les visiteurs pourront toujours analyser, mais leurs analyses ' +
      'n’apparaîtront plus dans la console. Le quota anonyme redeviendra ' +
      'un compteur en mémoire, perdu à chaque redémarrage.',
  },
};

export default function SettingsTab() {
  const [rows, setRows] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingKey, setSavingKey] = useState(null);
  const [savedKey, setSavedKey] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const loadSettings = useStore((s) => s.loadSettings);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await admin.listSettings();
      setRows(data);
      setDrafts(Object.fromEntries(data.map((r) => [r.key, r.value])));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const commit = useCallback(async (key, value) => {
    setSavingKey(key);
    try {
      const updated = await admin.updateSetting(key, value);
      setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...updated } : r)));
      setDrafts((prev) => ({ ...prev, [key]: String(updated.value) }));
      setSavedKey(key);
      setTimeout(() => setSavedKey((k) => (k === key ? null : k)), 2200);
      // Recharge le cache global : l'app applique le changement sans refresh.
      await loadSettings();
      toast.success('Réglage appliqué à toute la plateforme.');
    } catch (err) {
      toast.error(err.message, 'Enregistrement refusé');
      setDrafts((prev) => ({
        ...prev,
        [key]: rows.find((r) => r.key === key)?.value ?? prev[key],
      }));
    } finally {
      setSavingKey(null);
      setConfirm(null);
    }
  }, [loadSettings, rows]);

  const handleToggle = (row, next) => {
    const rule = SENSITIVE[row.key];
    const needsConfirm = rule && ((next && rule.on) || (!next && rule.off));
    if (needsConfirm) {
      setConfirm({
        key: row.key,
        value: String(next),
        title: next ? rule.on : rule.off,
        message: rule.message,
      });
      return;
    }
    setDrafts((prev) => ({ ...prev, [row.key]: String(next) }));
    commit(row.key, String(next));
  };

  const grouped = useMemo(
    () => CATEGORIES.map((cat) => ({
      ...cat,
      items: rows.filter((r) => r.category === cat.id),
    })).filter((cat) => cat.items.length),
    [rows]
  );

  const dirtyCount = rows.filter(
    (r) => r.value_type !== 'boolean' && drafts[r.key] !== r.value
  ).length;

  if (loading) {
    return (
      <div className="sa-section">
        <div className="sa-loading">
          <Loader2 size={28} className="spinner" />
          <p>Chargement des paramètres…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="sa-section">
      <div className="sa-section-head">
        <div>
          <h2>Paramètres de la plateforme</h2>
          <p>
            Chaque modification est écrite dans <code>system_settings</code>, journalisée
            dans l’audit et appliquée immédiatement côté serveur comme côté client.
          </p>
        </div>
        <div className="row">
          {dirtyCount > 0 && (
            <span className="badge badge-warning">{dirtyCount} modification(s) non enregistrée(s)</span>
          )}
          <button className="btn btn-secondary btn-sm" onClick={load}>
            <RefreshCw size={14} /> Recharger
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger">
          <AlertTriangle size={17} />
          <div>
            <strong>Paramètres illisibles.</strong> {error}
          </div>
        </div>
      )}

      {grouped.map((cat) => (
        <section key={cat.id} className="card sa-settings-group">
          <header className="sa-settings-head">
            <div className="sa-settings-icon"><cat.Icon size={18} /></div>
            <div>
              <h3>{cat.label}</h3>
              <p>{cat.hint}</p>
            </div>
          </header>

          <div className="sa-settings-list">
            {cat.items.map((row) => {
              const locked = row.key === 'root_super_admin_email';
              const draft = drafts[row.key] ?? row.value;
              const dirty = draft !== row.value;
              const isSaving = savingKey === row.key;

              return (
                <div key={row.key} className={`sa-setting${locked ? ' is-locked' : ''}`}>
                  <div className="sa-setting-label">
                    <label htmlFor={`set-${row.key}`}>
                      {row.description || row.key}
                      {locked && <Lock size={12} aria-label="Verrouillé" />}
                    </label>
                    <code>{row.key}</code>
                  </div>

                  <div className="sa-setting-control">
                    {row.value_type === 'boolean' ? (
                      <label className="toggle">
                        <input
                          id={`set-${row.key}`}
                          type="checkbox"
                          checked={draft === 'true'}
                          disabled={locked || isSaving}
                          onChange={(e) => handleToggle(row, e.target.checked)}
                        />
                        <span className="toggle-track"><span className="toggle-thumb" /></span>
                        <span className="toggle-text">
                          {draft === 'true' ? 'Activé' : 'Désactivé'}
                        </span>
                      </label>
                    ) : row.value_type === 'text' ? (
                      <textarea
                        id={`set-${row.key}`}
                        rows={2}
                        value={draft}
                        disabled={locked || isSaving}
                        onChange={(e) => setDrafts((p) => ({ ...p, [row.key]: e.target.value }))}
                      />
                    ) : (
                      <input
                        id={`set-${row.key}`}
                        type={row.value_type === 'number' ? 'number' : 'text'}
                        value={draft}
                        disabled={locked || isSaving}
                        min={row.value_type === 'number' ? 0 : undefined}
                        onChange={(e) => setDrafts((p) => ({ ...p, [row.key]: e.target.value }))}
                      />
                    )}

                    {row.value_type !== 'boolean' && !locked && (
                      <div className="sa-setting-actions">
                        {dirty && (
                          <button
                            className="btn btn-ghost btn-icon"
                            title="Annuler"
                            aria-label="Annuler la modification"
                            onClick={() => setDrafts((p) => ({ ...p, [row.key]: row.value }))}
                          >
                            <RotateCcw size={15} />
                          </button>
                        )}
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={!dirty || isSaving}
                          onClick={() => commit(row.key, draft)}
                        >
                          {isSaving
                            ? <><Loader2 size={14} className="spinner" /> …</>
                            : savedKey === row.key
                              ? <><Check size={14} /> Enregistré</>
                              : <><Save size={14} /> Enregistrer</>}
                        </button>
                      </div>
                    )}

                    {row.value_type === 'boolean' && savedKey === row.key && (
                      <span className="sa-setting-saved"><Check size={14} /> Appliqué</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <ConfirmDialog
        open={Boolean(confirm)}
        busy={Boolean(savingKey)}
        onClose={() => setConfirm(null)}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel="Confirmer"
        tone="warning"
        onConfirm={() => commit(confirm.key, confirm.value)}
      />
    </div>
  );
}
