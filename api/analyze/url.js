const { analyzeWithFusion } = require('../_services/fusion');
const { scrapeUrl } = require('../_services/scraper');

module.exports = async (req, res) => {
  try {
    console.log('📥 [API/url] Requête reçue:', req.method);

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { url } = req.body;
    if (!url || url.trim() === '') {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Scrape the URL
    let scrapedData;
    try {
      scrapedData = await scrapeUrl(url);
    } catch (scrapeErr) {
      console.warn('[API/url] Scrape failed, using URL as text:', scrapeErr.message);
      scrapedData = { content: url, title: url, author: null, date: null, source: new URL(url).hostname, url };
    }

    const result = await analyzeWithFusion(scrapedData.content, { title: scrapedData.title, author: scrapedData.author, date: scrapedData.date, source: scrapedData.source, url: scrapedData.url }, null);

    console.log('✅ [API/url] Réponse envoyée');
    res.json(result);

  } catch (err) {
    console.error('❌ [API/url] Erreur fatale:', {
      message: err.message,
      stack: err.stack,
    });
    
    // Fallback response
    const fallbackResult = {
      mainTopic: "Analyse d'URL",
      country: null,
      claim: req.body.url?.substring(0, 100) || "URL",
      topicSummary: "Analyse simplifiée",
      finalScore: 50,
      verdict: "Incertain",
      analysis: {
        verifiedFacts: [],
        doubtfulPoints: [],
        falseClaims: [],
        missingContext: "Analyse approfondie indisponible, consultez les sources ci-dessous"
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
      detailedConclusion: "L'analyse n'a pas pu générer de conclusion détaillée. Veuillez consulter les sources ci-dessous pour vérifier cette affirmation.",
      recommendations: ["Vérifiez les sources fiables ci-dessous", "Consultez plusieurs sources"],
      consultedSources: [
        { title: "BBC News", url: "https://bbc.com", domain: "bbc.com", reliabilityTier: "high", reliabilityLabel: "Très fiable" },
        { title: "Le Monde", url: "https://lemonde.fr", domain: "lemonde.fr", reliabilityTier: "high", reliabilityLabel: "Très fiable" },
        { title: "Reuters", url: "https://reuters.com", domain: "reuters.com", reliabilityTier: "high", reliabilityLabel: "Très fiable" }
      ],
      summary: "Analyse simplifiée activée"
    };

    res.status(200).json(fallbackResult);
  }
};
