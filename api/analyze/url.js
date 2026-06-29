const { analyzeWithFusion } = require('../_services/fusion');
const { scrapeUrl } = require('../_services/scraper');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { url } = req.body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL manquante.' });
    }

    const scraped = await scrapeUrl(url.trim());
    const result = await analyzeWithFusion(scraped.content, {
      title: scraped.title,
      author: scraped.author,
      date: scraped.date,
      source: scraped.source,
      url: scraped.url,
    });

    res.json(result);
  } catch (err) {
    console.error('Analysis error:', err);
    res.status(500).json({ error: err.message || 'Erreur interne du serveur' });
  }
};
