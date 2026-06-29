// Super detailed error handling for debugging
import { analyzeWithFusion } from '../_services/fusion.js';

export default async function handler(req, res) {
  console.log('=== [api/analyze/text] START ===');
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

    const { text } = body;
    if (!text || text.trim() === '') {
      console.log('Error: Missing text');
      return res.status(400).json({ error: 'Text is required' });
    }

    console.log('Calling analyzeWithFusion...');
    const result = await analyzeWithFusion(text, {}, (progress) => {
      console.log('Progress:', progress);
    });

    console.log('=== [api/analyze/text] SUCCESS ===');
    res.json(result);

  } catch (err) {
    console.error('=== [api/analyze/text] FATAL ERROR ===');
    console.error('Error name:', err.name);
    console.error('Error message:', err.message);
    console.error('Error stack:', err.stack);
    console.error('=== END ERROR ===');

    // Fallback response
    const fallbackResult = {
      mainTopic: "Analyse de contenu",
      country: null,
      claim: text?.substring(0, 100) || "Texte fourni",
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
