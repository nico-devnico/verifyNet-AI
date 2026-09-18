/**
 * Extraction de texte depuis une image ou un document, entièrement dans le
 * navigateur.
 *
 * Trois stratégies selon le fichier :
 *   • Image (png/jpg/webp/…)  → OCR Tesseract, français + anglais.
 *   • PDF                     → on lit d'abord la couche texte via pdf.js.
 *                               Si le PDF est un scan (pas de couche texte),
 *                               chaque page est rendue en canvas puis passée à
 *                               l'OCR.
 *   • DOCX / TXT / MD / CSV   → lecture directe (mammoth pour le DOCX).
 *
 * Faire l'extraction côté client a trois avantages : aucun coût d'API, aucun
 * envoi du fichier à un service tiers de reconnaissance, et une progression
 * affichable finement.
 *
 * À noter : l'analyse elle-même n'envoie que le texte extrait. Le fichier
 * d'origine n'est copié dans le stockage privé Supabase que si le réglage
 * `enable_file_archiving` est actif, et uniquement pour un utilisateur connecté.
 *
 * Note : Tesseract télécharge son moteur WASM et les données de langue depuis
 * un CDN au premier usage (quelques Mo, ensuite mis en cache par le
 * navigateur). Une connexion est donc nécessaire la première fois.
 */

/*
 * pdf.js, mammoth et Tesseract sont chargés à la demande. Réunis, ils pèsent
 * plus que tout le reste de l'application : les importer statiquement ferait
 * payer ce poids à quelqu'un qui vient simplement coller un texte. Les
 * `loadX()` mémorisent la promesse, donc un second fichier réutilise le module
 * déjà en mémoire.
 */
let pdfjsPromise = null;
let mammothPromise = null;

function loadPdfjs() {
  pdfjsPromise ??= (async () => {
    const [pdfjs, workerUrl] = await Promise.all([
      import('pdfjs-dist/build/pdf.min.mjs'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]);
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.default;
    return pdfjs;
  })().catch((err) => {
    pdfjsPromise = null;                 // permet une nouvelle tentative
    throw new ExtractionError(
      "Le lecteur PDF n'a pas pu être chargé. Vérifiez votre connexion puis réessayez.",
      'PDF_LOAD_FAILED',
      { cause: err }
    );
  });
  return pdfjsPromise;
}

function loadMammoth() {
  mammothPromise ??= import('mammoth/mammoth.browser.js')
    .then((mod) => mod.default ?? mod)
    .catch((err) => {
      mammothPromise = null;
      throw new ExtractionError(
        "Le lecteur Word n'a pas pu être chargé. Vérifiez votre connexion puis réessayez.",
        'DOCX_LOAD_FAILED',
        { cause: err }
      );
    });
  return mammothPromise;
}

/** Langues OCR. `fra+eng` couvre la majorité des contenus visés. */
const OCR_LANGS = 'fra+eng';

/** Au-delà, l'OCR d'un PDF scanné deviendrait trop long pour l'utilisateur. */
const MAX_OCR_PAGES = 12;

/** En dessous de ce nombre de caractères par page, on considère le PDF scanné. */
const SCANNED_PDF_THRESHOLD = 40;

export const IMAGE_MIMES = [
  'image/png', 'image/jpeg', 'image/jpg', 'image/webp',
  'image/gif', 'image/bmp', 'image/tiff',
];

export const DOCUMENT_MIMES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain', 'text/markdown', 'text/csv',
];

const EXT_FALLBACK = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  gif: 'image/gif', bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain', md: 'text/markdown', csv: 'text/csv',
};

export const ACCEPT_IMAGE = IMAGE_MIMES.join(',');
export const ACCEPT_DOCUMENT = '.pdf,.docx,.txt,.md,.csv,application/pdf,' +
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain';

/** Certains navigateurs laissent `file.type` vide : on retombe sur l'extension. */
export function resolveMime(file) {
  if (file?.type) return file.type;
  const ext = file?.name?.split('.').pop()?.toLowerCase();
  return EXT_FALLBACK[ext] || '';
}

export function detectKind(file) {
  const mime = resolveMime(file);
  if (IMAGE_MIMES.includes(mime)) return 'image';
  if (DOCUMENT_MIMES.includes(mime)) return 'document';
  return null;
}

export function isSupported(file) {
  return detectKind(file) !== null;
}

export function formatBytes(bytes) {
  if (!bytes) return '0 o';
  const units = ['o', 'Ko', 'Mo', 'Go'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

class ExtractionError extends Error {
  constructor(message, code, options) {
    super(message, options);
    this.name = 'ExtractionError';
    this.code = code;
  }
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw new ExtractionError('Extraction annulée.', 'ABORTED');
}

/* -------------------------------------------------------------------------- */
/* Moteur OCR                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Crée un worker Tesseract. L'appelant est responsable de le terminer :
 * pour un PDF de plusieurs pages, on réutilise le même worker sur toutes les
 * pages, ce qui évite de recharger le modèle à chaque page.
 */
async function createOcrWorker(onStatus) {
  let Tesseract;
  try {
    Tesseract = await import('tesseract.js');
  } catch {
    throw new ExtractionError(
      "Le moteur d'OCR n'a pas pu être chargé. Vérifiez votre connexion internet.",
      'OCR_LOAD_FAILED'
    );
  }

  const createWorker = Tesseract.createWorker ?? Tesseract.default?.createWorker;
  if (!createWorker) {
    throw new ExtractionError("Moteur d'OCR indisponible.", 'OCR_UNAVAILABLE');
  }

  try {
    return await createWorker(OCR_LANGS, 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') return; // rapporté par l'appelant
        onStatus?.(m.status, m.progress);
      },
    });
  } catch (err) {
    throw new ExtractionError(
      "Impossible d'initialiser l'OCR (téléchargement du modèle de langue échoué). " +
      'Vérifiez votre connexion puis réessayez.',
      'OCR_INIT_FAILED',
      { cause: err }
    );
  }
}

async function ocrImage(worker, source, onProgress) {
  const { data } = await worker.recognize(source);
  onProgress?.(1);
  return {
    text: data.text || '',
    confidence: typeof data.confidence === 'number' ? data.confidence : null,
  };
}

/* -------------------------------------------------------------------------- */
/* Stratégie : image                                                           */
/* -------------------------------------------------------------------------- */

async function extractFromImage(file, { onProgress, signal }) {
  onProgress?.({ progress: 5, message: "Chargement du moteur de reconnaissance…" });

  const worker = await createOcrWorker((status, p) => {
    const pct = 5 + Math.round((p || 0) * 25);
    onProgress?.({ progress: pct, message: translateStatus(status) });
  });

  try {
    throwIfAborted(signal);
    onProgress?.({ progress: 40, message: 'Reconnaissance du texte…' });

    const { text, confidence } = await ocrImage(worker, file);
    onProgress?.({ progress: 95, message: 'Finalisation…' });

    const clean = normalize(text);
    if (!clean) {
      throw new ExtractionError(
        "Aucun texte n'a été détecté dans cette image. Essayez une image plus nette, " +
        'mieux cadrée ou avec un meilleur contraste.',
        'NO_TEXT_FOUND'
      );
    }

    return {
      text: clean,
      method: 'ocr',
      confidence,
      pageCount: 1,
      warnings: confidence !== null && confidence < 60
        ? ["La qualité de reconnaissance est faible : relisez et corrigez le texte avant l'analyse."]
        : [],
    };
  } finally {
    await worker.terminate().catch(() => {});
  }
}

/* -------------------------------------------------------------------------- */
/* Stratégie : PDF                                                             */
/* -------------------------------------------------------------------------- */

async function extractFromPdf(file, { onProgress, signal }) {
  onProgress?.({ progress: 2, message: 'Chargement du lecteur PDF…' });
  const pdfjs = await loadPdfjs();

  onProgress?.({ progress: 5, message: 'Ouverture du PDF…' });

  const buffer = await file.arrayBuffer();
  let pdf;
  try {
    pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  } catch (err) {
    if (/password/i.test(err?.message || '')) {
      throw new ExtractionError(
        'Ce PDF est protégé par un mot de passe et ne peut pas être lu.',
        'PDF_ENCRYPTED'
      );
    }
    throw new ExtractionError('Ce fichier PDF est illisible ou corrompu.', 'PDF_INVALID');
  }

  const pageCount = pdf.numPages;
  const parts = [];

  for (let i = 1; i <= pageCount; i += 1) {
    throwIfAborted(signal);
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    parts.push(
      content.items
        .map((item) => (typeof item.str === 'string' ? item.str : ''))
        .join(' ')
    );
    onProgress?.({
      progress: 5 + Math.round((i / pageCount) * 35),
      message: `Lecture de la page ${i} sur ${pageCount}…`,
    });
  }

  const layerText = normalize(parts.join('\n\n'));

  // Couche texte suffisante : un PDF numérique natif, pas besoin d'OCR.
  if (layerText.length >= pageCount * SCANNED_PDF_THRESHOLD) {
    onProgress?.({ progress: 100, message: 'Texte extrait.' });
    return { text: layerText, method: 'pdf-text', confidence: null, pageCount, warnings: [] };
  }

  // Sinon : PDF scanné, on rend les pages en image puis on les passe à l'OCR.
  onProgress?.({
    progress: 42,
    message: 'PDF scanné détecté — reconnaissance optique en cours…',
  });

  const pagesToOcr = Math.min(pageCount, MAX_OCR_PAGES);
  const worker = await createOcrWorker((status, p) => {
    onProgress?.({
      progress: 42 + Math.round((p || 0) * 8),
      message: translateStatus(status),
    });
  });

  const ocrParts = [];
  const confidences = [];

  try {
    for (let i = 1; i <= pagesToOcr; i += 1) {
      throwIfAborted(signal);
      const page = await pdf.getPage(i);
      const canvas = await renderPageToCanvas(page);

      const { text, confidence } = await ocrImage(worker, canvas);
      if (text.trim()) ocrParts.push(text);
      if (typeof confidence === 'number') confidences.push(confidence);

      // Libère la mémoire : un canvas de page A4 à l'échelle 2 pèse ~25 Mo.
      canvas.width = 0;
      canvas.height = 0;

      onProgress?.({
        progress: 50 + Math.round((i / pagesToOcr) * 45),
        message: `Reconnaissance de la page ${i} sur ${pagesToOcr}…`,
      });
    }
  } finally {
    await worker.terminate().catch(() => {});
  }

  const ocrText = normalize(ocrParts.join('\n\n'));
  const best = ocrText.length > layerText.length ? ocrText : layerText;

  if (!best) {
    throw new ExtractionError(
      "Aucun texte exploitable n'a pu être extrait de ce PDF.",
      'NO_TEXT_FOUND'
    );
  }

  const warnings = [];
  if (pageCount > pagesToOcr) {
    warnings.push(
      `Document volumineux : seules les ${pagesToOcr} premières pages sur ${pageCount} ont été analysées.`
    );
  }
  const avgConfidence = confidences.length
    ? confidences.reduce((a, b) => a + b, 0) / confidences.length
    : null;
  if (avgConfidence !== null && avgConfidence < 60) {
    warnings.push("Qualité de numérisation faible : relisez le texte extrait avant l'analyse.");
  }

  return {
    text: best,
    method: ocrText.length > layerText.length ? 'pdf-ocr' : 'pdf-text',
    confidence: avgConfidence,
    pageCount,
    warnings,
  };
}

async function renderPageToCanvas(page, scale = 2) {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  const canvasContext = canvas.getContext('2d', { willReadFrequently: true });
  // `canvas` et `canvasContext` sont passés tous les deux pour rester
  // compatible avec les différentes signatures de render() de pdf.js.
  await page.render({ canvas, canvasContext, viewport }).promise;
  return canvas;
}

/* -------------------------------------------------------------------------- */
/* Stratégie : DOCX et texte brut                                              */
/* -------------------------------------------------------------------------- */

async function extractFromDocx(file, { onProgress }) {
  onProgress?.({ progress: 10, message: 'Chargement du lecteur Word…' });
  const mammoth = await loadMammoth();

  onProgress?.({ progress: 20, message: 'Lecture du document Word…' });
  const arrayBuffer = await file.arrayBuffer();

  let result;
  try {
    result = await mammoth.extractRawText({ arrayBuffer });
  } catch {
    throw new ExtractionError(
      'Ce document Word est illisible. Enregistrez-le au format .docx puis réessayez.',
      'DOCX_INVALID'
    );
  }

  onProgress?.({ progress: 90, message: 'Finalisation…' });
  const text = normalize(result.value);
  if (!text) {
    throw new ExtractionError('Ce document ne contient aucun texte.', 'NO_TEXT_FOUND');
  }

  return {
    text,
    method: 'docx',
    confidence: null,
    pageCount: null,
    warnings: result.messages?.length
      ? ['Certains éléments de mise en forme ont été ignorés.']
      : [],
  };
}

async function extractFromPlainText(file, { onProgress }) {
  onProgress?.({ progress: 40, message: 'Lecture du fichier…' });
  const raw = await file.text();
  const text = normalize(raw);
  if (!text) throw new ExtractionError('Ce fichier est vide.', 'NO_TEXT_FOUND');

  onProgress?.({ progress: 100, message: 'Texte chargé.' });
  return { text, method: 'plain-text', confidence: null, pageCount: null, warnings: [] };
}

/* -------------------------------------------------------------------------- */
/* Point d'entrée                                                              */
/* -------------------------------------------------------------------------- */

/**
 * @param {File} file
 * @param {{ onProgress?: (s: {progress:number,message:string}) => void,
 *           signal?: AbortSignal, maxSizeMb?: number }} options
 * @returns {Promise<{text:string, method:string, confidence:number|null,
 *                    pageCount:number|null, warnings:string[], kind:string}>}
 */
export async function extractText(file, options = {}) {
  const { maxSizeMb = 15 } = options;

  if (!file) throw new ExtractionError('Aucun fichier fourni.', 'NO_FILE');

  const kind = detectKind(file);
  if (!kind) {
    throw new ExtractionError(
      `Format non pris en charge : ${file.name}. Formats acceptés : ` +
      'images (PNG, JPG, WEBP, GIF, BMP, TIFF), PDF, DOCX, TXT, MD, CSV.',
      'UNSUPPORTED_FORMAT'
    );
  }

  if (file.size > maxSizeMb * 1024 * 1024) {
    throw new ExtractionError(
      `Fichier trop volumineux (${formatBytes(file.size)}). Maximum autorisé : ${maxSizeMb} Mo.`,
      'FILE_TOO_LARGE'
    );
  }

  const mime = resolveMime(file);
  let result;

  if (kind === 'image') {
    result = await extractFromImage(file, options);
  } else if (mime === 'application/pdf') {
    result = await extractFromPdf(file, options);
  } else if (mime.includes('wordprocessingml')) {
    result = await extractFromDocx(file, options);
  } else {
    result = await extractFromPlainText(file, options);
  }

  return { ...result, kind };
}

/* -------------------------------------------------------------------------- */
/* Utilitaires                                                                 */
/* -------------------------------------------------------------------------- */

/** Nettoie le texte extrait en conservant la structure en paragraphes. */
function normalize(text) {
  if (!text) return '';
  return String(text)
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    // Recolle les mots coupés par un tiret en fin de ligne (fréquent en PDF)
    .replace(/(\w)-\n(\w)/g, '$1$2')
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const STATUS_LABELS = {
  'loading tesseract core': 'Chargement du moteur OCR…',
  'initializing tesseract': 'Initialisation du moteur…',
  'loading language traineddata': 'Téléchargement du modèle de langue…',
  'initializing api': 'Préparation de la reconnaissance…',
  'recognizing text': 'Reconnaissance du texte…',
};

function translateStatus(status) {
  return STATUS_LABELS[status] || 'Préparation…';
}

export { ExtractionError };
