import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { UploadCloud, ImageIcon, FileText, X, ClipboardPaste } from 'lucide-react';
import { detectKind, formatBytes, resolveMime, ACCEPT_IMAGE, ACCEPT_DOCUMENT } from '../../lib/extract';
import './FileDropzone.css';

/**
 * Zone de dépôt de fichier : glisser-déposer, sélection classique, et
 * collage depuis le presse-papiers (Ctrl+V) — pratique pour analyser une
 * capture d'écran sans passer par l'enregistrement d'un fichier.
 *
 * @param {'image'|'document'} kind type attendu
 * @param {File|null} file fichier actuellement sélectionné
 * @param {(file: File|null) => void} onSelect
 * @param {(message: string) => void} onReject
 * @param {number} maxSizeMb
 * @param {boolean} disabled
 */
export default function FileDropzone({
  kind,
  file,
  onSelect,
  onReject,
  maxSizeMb = 15,
  disabled = false,
}) {
  const [dragging, setDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const inputRef = useRef(null);
  const dragCounter = useRef(0);

  const isImage = kind === 'image';

  /* Aperçu de l'image, révoqué pour éviter les fuites d'URL objet. */
  useEffect(() => {
    if (!file || !resolveMime(file).startsWith('image/')) {
      setPreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const validate = useCallback(
    (candidate) => {
      if (!candidate) return false;

      const detected = detectKind(candidate);
      if (detected !== kind) {
        onReject?.(
          isImage
            ? `« ${candidate.name} » n'est pas une image reconnue. Formats acceptés : PNG, JPG, WEBP, GIF, BMP, TIFF.`
            : `« ${candidate.name} » n'est pas un document reconnu. Formats acceptés : PDF, DOCX, TXT, MD, CSV.`
        );
        return false;
      }
      if (candidate.size > maxSizeMb * 1024 * 1024) {
        onReject?.(
          `Fichier trop volumineux (${formatBytes(candidate.size)}). Maximum : ${maxSizeMb} Mo.`
        );
        return false;
      }
      return true;
    },
    [kind, isImage, maxSizeMb, onReject]
  );

  const accept = useCallback(
    (candidate) => {
      if (validate(candidate)) onSelect?.(candidate);
    },
    [validate, onSelect]
  );

  /* --- Glisser-déposer ---------------------------------------------------- */
  // Un compteur est nécessaire car dragleave se déclenche aussi au passage
  // sur les éléments enfants de la zone.
  const onDragEnter = (e) => {
    e.preventDefault();
    if (disabled) return;
    dragCounter.current += 1;
    setDragging(true);
  };

  const onDragLeave = (e) => {
    e.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setDragging(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    dragCounter.current = 0;
    setDragging(false);
    if (disabled) return;
    const dropped = e.dataTransfer?.files?.[0];
    if (dropped) accept(dropped);
  };

  /* --- Collage depuis le presse-papiers ---------------------------------- */
  useEffect(() => {
    if (!isImage || disabled) return undefined;

    const onPaste = (e) => {
      const target = e.target;
      const isTextField = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';
      if (isTextField) return;

      const item = [...(e.clipboardData?.items || [])].find((it) => it.type.startsWith('image/'));
      if (!item) return;

      const pasted = item.getAsFile();
      if (pasted) {
        const named = pasted.name
          ? pasted
          : new File([pasted], `capture-${Date.now()}.png`, { type: pasted.type });
        accept(named);
      }
    };

    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [isImage, disabled, accept]);

  /* --- Fichier sélectionné ----------------------------------------------- */
  if (file) {
    return (
      <div className="dropzone-selected card">
        {previewUrl ? (
          <img src={previewUrl} alt={`Aperçu de ${file.name}`} className="dropzone-preview" />
        ) : (
          <div className="dropzone-file-icon">
            <FileText size={26} />
          </div>
        )}

        <div className="dropzone-file-meta">
          <strong title={file.name}>{file.name}</strong>
          <span>
            {formatBytes(file.size)}
            {resolveMime(file) && ` · ${resolveMime(file).split('/').pop().toUpperCase()}`}
          </span>
        </div>

        <button
          type="button"
          className="btn btn-ghost btn-icon"
          onClick={() => onSelect?.(null)}
          disabled={disabled}
          aria-label="Retirer le fichier"
          title="Retirer le fichier"
        >
          <X size={18} />
        </button>
      </div>
    );
  }

  /* --- Zone vide --------------------------------------------------------- */
  return (
    <motion.div
      className={`dropzone ${dragging ? 'dragging' : ''} ${disabled ? 'disabled' : ''}`}
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={isImage ? 'Importer une image' : 'Importer un document'}
      animate={{ scale: dragging ? 1.01 : 1 }}
    >
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept={isImage ? ACCEPT_IMAGE : ACCEPT_DOCUMENT}
        onChange={(e) => {
          const chosen = e.target.files?.[0];
          if (chosen) accept(chosen);
          e.target.value = '';
        }}
        disabled={disabled}
        tabIndex={-1}
      />

      <div className="dropzone-icon">
        {isImage ? <ImageIcon size={26} /> : <UploadCloud size={26} />}
      </div>

      <p className="dropzone-title">
        {dragging
          ? 'Déposez le fichier ici'
          : isImage
            ? 'Glissez une image ou cliquez pour choisir'
            : 'Glissez un document ou cliquez pour choisir'}
      </p>

      <p className="dropzone-hint">
        {isImage
          ? 'PNG, JPG, WEBP, GIF, BMP, TIFF'
          : 'PDF, DOCX, TXT, MD, CSV'}
        {' · '}
        {maxSizeMb} Mo maximum
      </p>

      {isImage && (
        <p className="dropzone-paste">
          <ClipboardPaste size={13} />
          Vous pouvez aussi coller une capture d’écran avec
          <span className="kbd">Ctrl</span>+<span className="kbd">V</span>
        </p>
      )}
    </motion.div>
  );
}
