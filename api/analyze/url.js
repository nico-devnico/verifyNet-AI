import { analyzeWithFusion } from '../../_services/fusion.js';
import { scrapeUrl } from '../../_services/scraper.js';

export default async function handler(req, res) {
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
      url: scraped.url
    });

    res.status(200).json(result);
  } catch (error) {
    console.error('[API] Error analyzing URL:', error);
    res.status(500).json({ error: error.message || 'Erreur interne du serveur' });
  }
}
