const express = require('express');
const router = express.Router();

const { analyzeWithFusion } = require('../services/fusion');
const { scrapeUrl, sanitizeText, sanitizeMultiline } = require('../services/scraper');
const { maintenanceGate, featureGate, quotaGate } = require('../middleware/gate');
const settings = require('../services/settings');
const anonymousAnalyses = require('../services/anonymousAnalyses');
const visitors = require('../services/visitors');

const MIN_CONTENT_LENGTH = 20;

/** Toute analyse est soumise au mode maintenance puis au quota journalier. */
router.use(maintenanceGate);

/**
 * Analyse en Server-Sent Events.
 * Les erreurs survenant AVANT le premier octet sont renvoyées en JSON (le
 * client peut alors lire le code d'erreur) ; ensuite seulement on bascule en
 * flux SSE, car on ne peut plus changer le statut HTTP après coup.
 */
async function handleAnalysisSSE(req, res, getContent) {
  let headersSent = false;

  const sendEvent = (type, data) => {
    res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    if (res.flush) res.flush();
  };

  try {
    const { content, metadata } = await getContent(req);

    const maxLength = await settings.getNumber('max_text_length', 20000);
    const trimmed = String(content || '').trim();

    if (trimmed.length < MIN_CONTENT_LENGTH) {
      return res.status(400).json({
        error: `Le contenu à analyser doit comporter au moins ${MIN_CONTENT_LENGTH} caractères (reçu : ${trimmed.length}).`,
        code: 'CONTENT_TOO_SHORT',
      });
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    headersSent = true;

    sendEvent('progress', { progress: 5, step: 'Initialisation...' });

    const result = await analyzeWithFusion(
      trimmed.slice(0, maxLength),
      metadata,
      ({ progress, step }) => {
        const progressMap = { 1: 20, 2: 40, 3: 60, 4: 80, 5: 98 };
        sendEvent('progress', { progress: progressMap[progress] || 50, step });
      }
    );

    if (typeof req.consumeQuota === 'function') req.consumeQuota();

    /*
     * Une analyse de visiteur n'a personne pour l'enregistrer : le client n'est
     * pas authentifié et RLS lui interdit d'écrire dans `analyses`. L'API s'en
     * charge donc ici, afin que le super admin voie ce trafic. Les analyses des
     * membres, elles, sont écrites par le client sous leur propre identité.
     *
     * L'écriture est attendue avant la fin du flux pour que le comptage du
     * quota suivant soit juste, mais elle ne peut pas faire échouer la réponse.
     */
    if (!req.auth) {
      /*
       * quotaGate pose déjà l'empreinte, mais un incident en amont (réglage
       * illisible, repli) peut laisser passer la requête sans `req.visitor`.
       * On recalcule ici pour que l'analyse apparaisse toujours au super admin.
       */
      const visitor = req.visitor || visitors.identify(req);
      await anonymousAnalyses.record({
        visitor,
        type: metadata.sourceKind || 'text',
        content: trimmed,
        result,
        metadata,
      });
    }

    sendEvent('complete', { ...result, sourceMetadata: metadata });
    return res.end();
  } catch (err) {
    console.error('[Analyse] Échec :', err.message);

    if (!headersSent) {
      return res.status(502).json({
        error: err.message || 'Erreur interne du serveur.',
        code: 'ANALYSIS_FAILED',
      });
    }
    try {
      sendEvent('error', { error: err.message || 'Erreur interne du serveur.' });
      res.end();
    } catch {
      /* connexion déjà fermée */
    }
    return undefined;
  }
}

/* ------------------------------------------------------------------ Texte -- */

router.post('/text', quotaGate, (req, res) =>
  handleAnalysisSSE(req, res, async () => ({
    content: sanitizeText(req.body?.text || ''),
    metadata: { sourceKind: 'text' },
  }))
);

/* -------------------------------------------------------------------- URL -- */

router.post('/url', quotaGate, (req, res) =>
  handleAnalysisSSE(req, res, async () => {
    const url = String(req.body?.url || '').trim();
    if (!url) throw new Error('URL manquante.');

    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error('URL invalide.');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Seules les URL http:// et https:// sont acceptées.');
    }

    const scraped = await scrapeUrl(url);
    return {
      content: scraped.content,
      metadata: {
        sourceKind: 'url',
        title: scraped.title,
        author: scraped.author,
        date: scraped.date,
        source: scraped.source,
        url: scraped.url,
      },
    };
  })
);

/* ---------------------------------------------------- Image et documents -- */

/**
 * Analyse d'un texte extrait d'une image ou d'un document.
 *
 * L'extraction (OCR, couche texte PDF, DOCX) a lieu dans le navigateur : le
 * fichier lui-même n'a pas besoin de transiter par l'API, seul le texte
 * reconnu est envoyé, accompagné de ses métadonnées de provenance.
 */
function extractedTextHandler(kind) {
  return (req, res) =>
    handleAnalysisSSE(req, res, async () => {
      const text = sanitizeMultiline(req.body?.text || '');
      const source = req.body?.source || {};

      const maxMb = await settings.getNumber('max_upload_size_mb', 15);
      if (source.size && source.size > maxMb * 1024 * 1024) {
        throw new Error(`Fichier trop volumineux : ${maxMb} Mo maximum.`);
      }

      return {
        content: text,
        metadata: {
          sourceKind: kind,
          title: source.fileName || null,
          fileName: source.fileName || null,
          fileMime: source.mime || null,
          fileSize: source.size || null,
          pageCount: source.pageCount || null,
          extractionMethod: source.method || null,
          extractionConfidence: source.confidence ?? null,
        },
      };
    });
}

router.post(
  '/image',
  featureGate('enable_image_analysis', "L'analyse d'images"),
  quotaGate,
  extractedTextHandler('image')
);

router.post(
  '/document',
  featureGate('enable_document_analysis', "L'analyse de documents"),
  quotaGate,
  extractedTextHandler('document')
);

module.exports = router;
