import { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X, AlertTriangle } from 'lucide-react';
import './Modal.css';

/**
 * Boîte de dialogue accessible : fermeture par Échap, clic sur le fond,
 * focus déplacé à l'ouverture, défilement de la page bloqué, et focus
 * restitué à l'élément d'origine à la fermeture.
 */
export default function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
}) {
  const panelRef = useRef(null);
  const previouslyFocused = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    previouslyFocused.current = document.activeElement;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    const focusTimer = setTimeout(() => {
      const target = panelRef.current?.querySelector(
        '[data-autofocus], input:not([type="hidden"]), textarea, select, button'
      );
      target?.focus();
    }, 40);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      clearTimeout(focusTimer);
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="modal-root">
          <motion.div
            className="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeOnBackdrop ? onClose : undefined}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === 'string' ? title : undefined}
            className={`modal-panel modal-${size}`}
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
          >
            {(title || onClose) && (
              <div className="modal-header">
                <div>
                  {title && <h2 className="modal-title">{title}</h2>}
                  {description && <p className="modal-description">{description}</p>}
                </div>
                <button className="modal-close" onClick={onClose} aria-label="Fermer">
                  <X size={18} />
                </button>
              </div>
            )}
            <div className="modal-content">{children}</div>
            {footer && <div className="modal-footer">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}

/**
 * Confirmation destructive. Remplace les `window.confirm()` du code d'origine,
 * qui ne permettaient ni de préciser un motif ni d'afficher l'élément concerné.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Confirmer l’action',
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  tone = 'danger',
  busy = false,
  children,
}) {
  const handleConfirm = useCallback(async () => {
    await onConfirm?.();
  }, [onConfirm]);

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      size="sm"
      closeOnBackdrop={!busy}
      title={
        <span className="confirm-title">
          <span className={`confirm-icon confirm-icon-${tone}`}>
            <AlertTriangle size={18} />
          </span>
          {title}
        </span>
      }
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            className={`btn btn-${tone}`}
            onClick={handleConfirm}
            disabled={busy}
            data-autofocus
          >
            {busy ? 'Traitement…' : confirmLabel}
          </button>
        </>
      }
    >
      {message && <p className="confirm-message">{message}</p>}
      {children}
    </Modal>
  );
}
