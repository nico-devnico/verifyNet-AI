import { useEffect, useState } from 'react';
import {
  Megaphone, Send, Loader2, Info, CheckCircle2, TriangleAlert, ShieldAlert,
  Users, UserCog, Crown, User as UserIcon, History,
} from 'lucide-react';

import * as admin from '../../services/admin';
import { toast } from '../../store/toast';
import { ConfirmDialog } from '../../components/ui/Modal';

const LEVELS = [
  { id: 'info',     label: 'Information', Icon: Info,          hint: 'Neutre, pour une annonce simple.' },
  { id: 'success',  label: 'Bonne nouvelle', Icon: CheckCircle2, hint: 'Nouvelle fonctionnalité, correctif livré.' },
  { id: 'warning',  label: 'Avertissement', Icon: TriangleAlert, hint: 'Maintenance prévue, changement de quota.' },
  { id: 'critical', label: 'Critique',    Icon: ShieldAlert,   hint: 'Incident, action requise de l’utilisateur.' },
];

const TARGETS = [
  { id: 'all',         label: 'Tous les comptes', Icon: Users },
  { id: 'user',        label: 'Utilisateurs standards', Icon: UserIcon },
  { id: 'admin',       label: 'Administrateurs', Icon: UserCog },
  { id: 'super_admin', label: 'Super admins', Icon: Crown },
];

const MAX_TITLE = 120;
const MAX_BODY = 600;

export default function BroadcastTab() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [level, setLevel] = useState('info');
  const [target, setTarget] = useState('all');
  const [sending, setSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [recent, setRecent] = useState([]);

  const loadRecent = async () => {
    try {
      const { items } = await admin.listActivityLogs({ search: 'BROADCAST', limit: 5 });
      setRecent(items);
    } catch {
      // L'historique est un bonus : son absence ne doit pas bloquer l'envoi.
    }
  };

  useEffect(() => { loadRecent(); }, []);

  const send = async () => {
    setSending(true);
    try {
      const count = await admin.broadcastNotification({ title, body, level, target });
      toast.success(
        `${count} destinataire${count !== 1 ? 's' : ''} notifié${count !== 1 ? 's' : ''}.`,
        'Diffusion envoyée'
      );
      setTitle('');
      setBody('');
      setLevel('info');
      setTarget('all');
      setConfirmOpen(false);
      await loadRecent();
    } catch (err) {
      toast.error(err.message, 'Diffusion refusée');
    } finally {
      setSending(false);
    }
  };

  const activeLevel = LEVELS.find((l) => l.id === level);
  const activeTarget = TARGETS.find((t) => t.id === target);
  const canSend = title.trim().length >= 3;

  return (
    <div className="sa-section">
      <div className="sa-section-head">
        <div>
          <h2><Megaphone size={19} /> Diffusion d’une notification</h2>
          <p>
            Le message est inséré dans <code>notifications</code> pour chaque compte ciblé
            et apparaît dans leur cloche dès leur prochaine synchronisation. Les comptes
            suspendus sont exclus.
          </p>
        </div>
      </div>

      <div className="sa-broadcast">
        <form
          className="card sa-broadcast-form"
          onSubmit={(e) => { e.preventDefault(); if (canSend) setConfirmOpen(true); }}
        >
          <div className="field">
            <label htmlFor="bc-title">Titre <span className="req">*</span></label>
            <input
              id="bc-title"
              type="text"
              value={title}
              maxLength={MAX_TITLE}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Maintenance planifiée dimanche à 22 h"
              required
            />
            <span className="field-hint">{title.length}/{MAX_TITLE}</span>
          </div>

          <div className="field">
            <label htmlFor="bc-body">Message</label>
            <textarea
              id="bc-body"
              rows={5}
              value={body}
              maxLength={MAX_BODY}
              onChange={(e) => setBody(e.target.value)}
              placeholder="L’analyse sera indisponible pendant environ trente minutes. Vos rapports restent accessibles."
            />
            <span className="field-hint">{body.length}/{MAX_BODY}</span>
          </div>

          <div className="field">
            <label>Niveau</label>
            <div className="sa-choice-grid">
              {LEVELS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`sa-choice${level === opt.id ? ' is-active' : ''} lvl-${opt.id}`}
                  onClick={() => setLevel(opt.id)}
                  aria-pressed={level === opt.id}
                >
                  <opt.Icon size={16} />
                  <span>
                    <strong>{opt.label}</strong>
                    <small>{opt.hint}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label htmlFor="bc-target">Destinataires</label>
            <select id="bc-target" value={target} onChange={(e) => setTarget(e.target.value)}>
              {TARGETS.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
          </div>

          <button type="submit" className="btn btn-primary" disabled={!canSend || sending}>
            {sending
              ? <><Loader2 size={16} className="spinner" /> Envoi…</>
              : <><Send size={16} /> Diffuser</>}
          </button>
        </form>

        <aside className="stack">
          <div className="card sa-broadcast-preview">
            <h3>Aperçu côté utilisateur</h3>
            <div className={`sa-notif-preview lvl-${level}`}>
              <span className="sa-notif-icon"><activeLevel.Icon size={16} /></span>
              <div>
                <strong>{title.trim() || 'Titre de la notification'}</strong>
                {body.trim() && <p>{body}</p>}
                <span className="sa-notif-time">à l’instant</span>
              </div>
            </div>
            <p className="text-muted" style={{ fontSize: '.8125rem', marginTop: 12 }}>
              Cible : <strong>{activeTarget.label}</strong>
            </p>
          </div>

          <div className="card sa-broadcast-recent">
            <h3><History size={15} /> Dernières diffusions</h3>
            {recent.length === 0 ? (
              <p className="text-muted" style={{ fontSize: '.875rem' }}>
                Aucune diffusion pour l’instant.
              </p>
            ) : (
              <ul>
                {recent.map((row) => (
                  <li key={row.id}>
                    <strong>{row.details?.title || 'Notification'}</strong>
                    <span>
                      {row.details?.recipients ?? '?'} destinataire(s) ·{' '}
                      {new Date(row.created_at).toLocaleString('fr-FR', {
                        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        busy={sending}
        onClose={() => setConfirmOpen(false)}
        onConfirm={send}
        title="Diffuser cette notification ?"
        message={`Elle sera envoyée à : ${activeTarget.label.toLowerCase()}. Une notification envoyée ne peut pas être rappelée.`}
        confirmLabel="Diffuser"
        tone={level === 'critical' ? 'danger' : 'warning'}
      />
    </div>
  );
}
