import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bell, CheckCheck, Info, CheckCircle2, TriangleAlert, ShieldAlert, Inbox,
} from 'lucide-react';

import useStore from '../../store';
import './NotificationBell.css';

const LEVEL_ICONS = {
  info: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
  critical: ShieldAlert,
};

/** Formatage relatif court : « il y a 5 min », « hier ». */
function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'hier';
  if (days < 7) return `il y a ${days} jours`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  const {
    notifications, unreadCount, markNotificationRead, markAllNotificationsRead,
  } = useStore();

  const unread = unreadCount();

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (e) => {
      if (!wrapperRef.current?.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => { if (e.key === 'Escape') setOpen(false); };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="bell-wrap" ref={wrapperRef}>
      <button
        className="bell-button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unread ? `Notifications, ${unread} non lue(s)` : 'Notifications'}
        aria-expanded={open}
      >
        <Bell size={18} />
        {unread > 0 && (
          <motion.span
            className="bell-badge"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            key={unread}
          >
            {unread > 9 ? '9+' : unread}
          </motion.span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="bell-panel"
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            role="dialog"
            aria-label="Notifications"
          >
            <header className="bell-head">
              <strong>Notifications</strong>
              {unread > 0 && (
                <button className="bell-mark" onClick={markAllNotificationsRead}>
                  <CheckCheck size={14} /> Tout marquer comme lu
                </button>
              )}
            </header>

            {notifications.length === 0 ? (
              <div className="bell-empty">
                <Inbox size={26} strokeWidth={1.5} />
                <p>Aucune notification pour le moment.</p>
              </div>
            ) : (
              <ul className="bell-list">
                {notifications.map((n) => {
                  const Icon = LEVEL_ICONS[n.level] || Info;
                  return (
                    <li key={n.id} className={`bell-item lvl-${n.level}${n.is_read ? '' : ' is-unread'}`}>
                      <button
                        onClick={() => !n.is_read && markNotificationRead(n.id)}
                        aria-label={n.is_read ? n.title : `${n.title} — marquer comme lu`}
                      >
                        <span className="bell-item-icon"><Icon size={15} /></span>
                        <span className="bell-item-body">
                          <strong>{n.title}</strong>
                          {n.body && <span>{n.body}</span>}
                          <small>{relativeTime(n.created_at)}</small>
                        </span>
                        {!n.is_read && <span className="bell-dot" aria-hidden="true" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
