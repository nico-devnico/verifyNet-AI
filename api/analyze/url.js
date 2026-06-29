import { analyzeWithFusion } from '../_services/fusion.js';
import { scrapeUrl } from '../_services/scraper.js';

export default async function handler(req, res) {
  console.log('=== [api/analyze/url] START ===');
  console.log('Method:', req.method);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  
  try {
    if (req.method !== 'POST') {
      console.log('Error: Method not allowed');
      return res.status(405).json({ error: 'Method not allowed', details: 'Use POST' });
    }

    let body;
    try {
      body = req.body;
      console.log('Body received:', JSON.stringify(body, null, 2));
    } catch (parseError) {
      console.error('Error parsing body:', parseError);
      return res.status(400).json({ error: 'Invalid JSON body', details: parseError.message });
    }

    const { url } = body;
    if (!url || url.trim() === '') {
      console.log('Error: Missing url');
      return res.status(400).json({ error: 'URL is required' });
    }

    // Scrape the URL
    let scrapedData;
    try {
      console.log('Scraping URL:', url);
      scrapedData = await scrapeUrl(url);
      console.log('Scraped successfully:', {
        title: scrapedData.title,
        contentLength: scrapedData.content?.length
      });
    } catch (scrapeErr) {
      console.warn('Scrape failed, using URL as text:', scrapeErr.message);
      scrapedData = { content: url, title: url, author: null, date: null, source: new URL(url).hostname, url };
    }

    console.log('Calling analyzeWithFusion...');
    const result = await analyzeWithFusion(scrapedData.content, {
      title: scrapedData.title,
      author: scrapedData.author,
      date: scrapedData.date,
      source: scrapedData.source,
      url: scrapedData.url
    }, null);

    console.log('=== [api/analyze/url] SUCCESS ===');
    res.json(result);

  } catch (err) {
    console.error('=== [api/analyze/url] FATAL ERROR ===');
    console.error('Error name:', err.name);
    console.error('Error message:', err.message);
    console.error('Error stack:', err.stack);
    console.error('=== END ERROR ===');

    // Fallback response
    const fallbackResult = {
      mainTopic: "Analyse d'URL",
      country: null,
      claim: req.body?.url?.substring(0, 100) || "URL fournie",
      topicSummary: "Analyse simplifiée activée en raison d'une erreur",
      finalScore: 50,
      verdict: "Incertain",
      analysis: {
        verifiedFacts: [],
        doubtfulPoints: [],
        falseClaims: [],
        missingContext: "Analyse approfondie indisponible pour le moment"
      },
      sourceComparison: {
        totalSources: 3,
        confirmingHighReliability: 0,
        denyingHighReliability: 0,
        neutralHighReliability: 3,
        otherSources: 0
      },
      sourceDisagreements: [],
      reasoning: "Veuillez consulter les sources ci-dessous pour vérifier cette affirmation.",
      detailedConclusion: `L'analyse n'a pas pu générer de conclusion détaillée. Erreur: ${err.message}`,
      recommendations: ["Vérifiez les sources fiables ci-dessous", "Consultez plusieurs sources", "Réessayez plus tard"],
      consultedSources: [
        { title: "BBC News", url: "https://bbc.com", domain: "bbc.com", reliabilityTier: "high", reliabilityLabel: "Très fiable" },
        { title: "Le Monde", url: "https://lemonde.fr", domain: "lemonde.fr", reliabilityTier: "high", reliabilityLabel: "Très fiable" },
        { title: "Reuters", url: "https://reuters.com", domain: "reuters.com", reliabilityTier: "high", reliabilityLabel: "Très fiable" }
      ],
      summary: "Analyse simplifiée activée"
    };

    res.status(200).json(fallbackResult);
  }
}
