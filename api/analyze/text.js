import { analyzeWithFusion } from '../../_services/fusion.js';
import { sanitizeText } from '../../_services/scraper.js';

export default async function handler(req, res) {
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

    res.status(200).json(result);
  } catch (error) {
    console.error('[API] Error analyzing text:', error);
    res.status(500).json({ error: error.message || 'Erreur interne du serveur' });
  }
}
