const { analyzeWithFusion } = require('../_services/fusion');
const { sanitizeText } = require('../_services/scraper');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length < 20) {
      return res.status(400).json({ error: 'Le texte doit contenir au moins 20 caractères.' });
    }

    const content = sanitizeText(text).slice(0, 5000);
    const result = await analyzeWithFusion(content, {});

    res.json(result);
  } catch (err) {
    console.error('Analysis error:', err);
    res.status(500).json({ error: err.message || 'Erreur interne du serveur' });
  }
};
