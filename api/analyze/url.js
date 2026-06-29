const { analyzeWithFusion } = require('../_services/fusion');
const { scrapeUrl } = require('../_services/scraper');

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
    const { url } = req.body;
    console.log('🔗 [API] URL reçue:', url);

    if (!url || typeof url !== 'string') {
      console.log('❌ [API] URL invalide');
      return res.status(400).json({ error: 'URL manquante.' });
    }

    console.log('🌐 [API] Scraping de l\'URL...');
    const scraped = await scrapeUrl(url.trim());
    console.log('✅ [API] Scraping terminé');

    console.log('🔍 [API] Début de l\'analyse...');
    const result = await analyzeWithFusion(scraped.content, {
      title: scraped.title,
      author: scraped.author,
      date: scraped.date,
      source: scraped.source,
      url: scraped.url,
    });
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
