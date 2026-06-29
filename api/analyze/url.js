import { analyzeWithFusion } from '../_services/fusion.js';
import { scrapeUrl, isValidUrl } from '../_services/scraper.js';

export default async (req, res) => {
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
    const { url } = req.body;
    
    if (!url || typeof url !== 'string' || !isValidUrl(url)) {
      return res.status(400).json({ error: 'URL invalide.' });
    }
    
    console.log('[API] Scraping URL:', url);
    const scraped = await scrapeUrl(url.trim());
    
    console.log('[API] Starting URL analysis...');
    const result = await analyzeWithFusion(scraped.content, {
      title: scraped.title,
      author: scraped.author,
      date: scraped.date,
      source: scraped.source,
      url: scraped.url
    }, ({ progress, step }) => {
      console.log(`[API] Progress: ${progress}% - ${step}`);
    });
    
    console.log('[API] Analysis complete');
    res.status(200).json(result);
    
  } catch (error) {
    console.error('[API] Error:', error);
    res.status(500).json({ error: error.message || 'Erreur interne du serveur' });
  }
};
