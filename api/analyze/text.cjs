const { analyzeWithFusion } = require('../_services/fusion.cjs');
const { sanitizeText } = require('../_services/scraper.cjs');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }
  
  try {
    const { text } = req.body;
    
    if (!text || typeof text !== 'string' || text.trim().length < 20) {
      return res.status(400).json({ error: 'Le texte doit contenir au moins 20 caractères.' });
    }
    
    const content = sanitizeText(text).slice(0, 5000);
    const metadata = {};
    
    console.log('[API] Starting text analysis...');
    const result = await analyzeWithFusion(content, metadata, ({ progress, step }) => {
      console.log(`[API] Progress: ${progress}% - ${step}`);
    });
    
    console.log('[API] Analysis complete');
    res.status(200).json(result);
    
  } catch (error) {
    console.error('[API] Error:', error);
    res.status(500).json({ error: error.message || 'Erreur interne du serveur' });
  }
};
