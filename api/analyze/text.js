const { analyzeWithFusion } = require('../_services/fusion');
const { sanitizeText } = require('../_services/scraper');

module.exports = async (req, res) => {
  console.log('📥 [API] Requête reçue:', {
    method: req.method,
    url: req.url,
    hasBody: !!req.body,
  });

  if (req.method !== 'POST') {
    console.log('❌ [API] Méthode non autorisée:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text } = req.body;
    console.log('📝 [API] Texte reçu:', text?.substring(0, 100) + '...');

    if (!text || typeof text !== 'string' || text.trim().length < 20) {
      console.log('❌ [API] Texte invalide:', { hasText: !!text, length: text?.length });
      return res.status(400).json({ error: 'Le texte doit contenir au moins 20 caractères.' });
    }

    const content = sanitizeText(text).slice(0, 5000);
    console.log('🔍 [API] Début de l\'analyse...');
    const result = await analyzeWithFusion(content, {});
    console.log('✅ [API] Analyse terminée');

    res.json(result);
  } catch (err) {
    console.error('❌ [API] Erreur:', {
      message: err.message,
      stack: err.stack,
    });
    res.status(500).json({ 
      error: err.message || 'Erreur interne du serveur',
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined 
    });
  }
};
