import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import { useToastStore } from '../../store/toast';
import './Toaster.css';

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

export default function Toaster() {
  const { toasts, dismiss } = useToastStore();

  return (
    <div className="toaster" role="region" aria-label="Notifications" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const Icon = ICONS[t.type] || Info;
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              className={`toast toast-${t.type}`}
            >
              <Icon size={19} className="toast-icon" />
              <div className="toast-body">
                {t.title && <strong className="toast-title">{t.title}</strong>}
                {t.message && <span className="toast-message">{t.message}</span>}
                {t.action && (
                  <button className="toast-action" onClick={() => { t.action.onClick(); dismiss(t.id); }}>
                    {t.action.label}
                  </button>
                )}
              </div>
              <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Fermer">
                <X size={15} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
