import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ScanText, AlertTriangle, Copy, Check, Loader2, Pencil, RotateCcw,
} from 'lucide-react';
import './ExtractedText.css';

const METHOD_LABELS = {
  ocr: 'Reconnaissance optique (OCR)',
  'pdf-text': 'Couche texte du PDF',
  'pdf-ocr': 'OCR des pages scannées',
  docx: 'Document Word',
  'plain-text': 'Fichier texte',
  manual: 'Saisie manuelle',
};

/** Progression de l'extraction, avec possibilité d'annuler. */
export function ExtractionProgress({ progress, message, onCancel }) {
  return (
    <motion.div
      className="extraction-progress card"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="extraction-progress-head">
        <Loader2 size={19} className="spinner" />
        <div>
          <strong>Extraction du texte en cours</strong>
          <span>{message || 'Préparation…'}</span>
        </div>
        <span className="extraction-percent">{Math.round(progress)}%</span>
      </div>

      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>

      <p className="extraction-note">
        Le fichier est traité directement dans votre navigateur : il n’est envoyé
        à aucun serveur. Au premier usage, le moteur de reconnaissance est
        téléchargé, ce qui peut prendre quelques instants.
      </p>

      {onCancel && (
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>
          Annuler
        </button>
      )}
    </motion.div>
  );
}

/**
 * Texte extrait, modifiable avant analyse.
 *
 * L'OCR se trompe : laisser l'utilisateur relire et corriger avant d'envoyer
 * le texte à l'analyse améliore nettement la qualité du résultat.
 */
export default function ExtractedText({
  value,
  onChange,
  meta = {},
  warnings = [],
  onReset,
  minLength = 20,
  maxLength = 20000,
  disabled = false,
}) {
  const [copied, setCopied] = useState(false);

  const stats = useMemo(() => {
    const text = value || '';
    return {
      chars: text.length,
      words: text.trim() ? text.trim().split(/\s+/).length : 0,
    };
  }, [value]);

  const tooShort = stats.chars > 0 && stats.chars < minLength;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* presse-papiers indisponible */
    }
  };

  return (
    <motion.div
      className="extracted card"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="extracted-head">
        <div className="extracted-head-title">
          <span className="extracted-icon"><ScanText size={17} /></span>
          <div>
            <strong>Texte extrait</strong>
            <span>{METHOD_LABELS[meta.method] || 'Extraction'}</span>
          </div>
        </div>

        <div className="extracted-actions">
          <button className="btn btn-ghost btn-sm" onClick={copy} title="Copier le texte">
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copié' : 'Copier'}
          </button>
          {onReset && (
            <button className="btn btn-ghost btn-sm" onClick={onReset} disabled={disabled}>
              <RotateCcw size={14} />
              Changer de fichier
            </button>
          )}
        </div>
      </div>

      <div className="extracted-badges">
        <span className="badge badge-secondary">{stats.words} mots</span>
        <span className="badge badge-secondary">{stats.chars} caractères</span>
        {meta.pageCount ? (
          <span className="badge badge-secondary">
            {meta.pageCount} page{meta.pageCount > 1 ? 's' : ''}
          </span>
        ) : null}
        {typeof meta.confidence === 'number' && (
          <span
            className={`badge ${
              meta.confidence >= 80 ? 'badge-success'
              : meta.confidence >= 60 ? 'badge-warning'
              : 'badge-danger'
            }`}
          >
            Fiabilité OCR : {Math.round(meta.confidence)}%
          </span>
        )}
      </div>

      {warnings.length > 0 && (
        <div className="alert alert-warning extracted-warnings">
          <AlertTriangle size={16} />
          <div>
            {warnings.map((w, i) => (
              <p key={i}>{w}</p>
            ))}
          </div>
        </div>
      )}

      <label className="extracted-label" htmlFor="extracted-text">
        <Pencil size={13} />
        Relisez et corrigez si nécessaire — c’est ce texte qui sera analysé.
      </label>

      <textarea
        id="extracted-text"
        className="extracted-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
        rows={11}
        disabled={disabled}
        spellCheck
      />

      <div className="extracted-footer">
        {tooShort ? (
          <span className="field-error">
            Au moins {minLength} caractères sont nécessaires pour lancer une analyse.
          </span>
        ) : (
          <span className="field-hint">
            {meta.fileName ? `Source : ${meta.fileName}` : ''}
          </span>
        )}
        <span className="field-hint">{stats.chars}/{maxLength}</span>
      </div>
    </motion.div>
  );
}
