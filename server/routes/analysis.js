const express = require('express');
const router = express.Router();
const { analyzeWithFusion } = require('../services/fusion');
const { analyzeContent } = require('../services/ai');
const { scrapeUrl, sanitizeText } = require('../services/scraper');

// Input validation middleware
const validateInput = (field, minLength = 20) => (req, res, next) => {
  const value = req.body[field];
  if (!value || typeof value !== 'string' || value.trim().length < minLength) {
    return res.status(400).json({ error: `Le champ "${field}" doit contenir au moins ${minLength} caractères.` });
  }
  next();
};

// Function to handle analysis with SSE progress
const handleAnalysisSSE = async (req, res, getContentFn) => {
  try {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': process.env.CLIENT_URL || 'http://localhost:5173',
    });

    const sendEvent = (type, data) => {
      res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
      // IMPORTANT: Flush the response to make sure events are sent immediately!
      if (res.flush) res.flush();
    };

    // Start with initialization
    sendEvent('progress', { progress: 5, step: 'Initialisation...' });

    const { content, metadata } = await getContentFn(req);

    const result = await analyzeWithFusion(content, metadata, ({ progress, step }) => {
      // Map step number to progress percentage
      const progressMap = {
        1: 20,
        2: 40,
        3: 60,
        4: 80,
        5: 98,
      };
      sendEvent('progress', {
        progress: progressMap[progress] || 50,
        step,
      });
    });

    sendEvent('complete', result);
    res.end();
  } catch (err) {
    console.error('Analysis error:', err);
    try {
      res.write(`event: error\ndata: ${JSON.stringify({ error: err.message || 'Erreur interne du serveur' })}\n\n`);
      res.end();
    } catch (e) {
      // If response already closed, ignore
    }
  }
};

// POST /api/analyze/text (SSE version)
router.post('/text', validateInput('text', 20), async (req, res, next) => {
  handleAnalysisSSE(req, res, async (req) => ({
    content: sanitizeText(req.body.text).slice(0, 5000),
    metadata: {},
  }));
});

// POST /api/analyze/url (SSE version)
router.post('/url', async (req, res, next) => {
  handleAnalysisSSE(req, res, async (req) => {
    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      throw new Error('URL manquante.');
    }
    const scraped = await scrapeUrl(url.trim());
    return {
      content: scraped.content,
      metadata: {
        title: scraped.title,
        author: scraped.author,
        date: scraped.date,
        source: scraped.source,
        url: scraped.url,
      },
    };
  });
});

module.exports = router;
