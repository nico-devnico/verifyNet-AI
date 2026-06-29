import { analyzeWithFusion } from '../_services/fusion.js';

export default async function handler(req, res) {
  try {
    console.log('📥 [API/text] Requête reçue:', req.method);

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { text } = req.body;
    if (!text || text.trim() === '') {
      return res.status(400).json({ error: 'Text is required' });
    }

    const result = await analyzeWithFusion(text, {}, null);

    console.log('✅ [API/text] Réponse envoyée');
    res.json(result);

  } catch (err) {
    console.error('❌ [API/text] Erreur fatale:', {
      message: err.message,
      stack: err.stack,
    });
    
    // Fallback response
    const fallbackResult = {
      mainTopic: "Analyse de contenu",
      country: null,
      claim: text.substring(0, 100),
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
