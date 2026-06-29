// Version ultra-simple pour diagnostic
module.exports = async (req, res) => {
  try {
    console.log('📥 [API] Requête reçue');

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Réponse simple sans dépendances externes
    const result = {
      mainTopic: "Analyse de test",
      country: null,
      claim: "Texte test",
      topicSummary: "Analyse simplifiée",
      finalScore: 50,
      verdict: "Incertain",
      analysis: {
        verifiedFacts: [],
        doubtfulPoints: [],
        falseClaims: [],
        missingContext: "Analyse simplifiée activée"
      },
      sourceComparison: {
        totalSources: 3,
        confirmingHighReliability: 0,
        denyingHighReliability: 0,
        neutralHighReliability: 3,
        otherSources: 0
      },
      sourceDisagreements: [],
      reasoning: "Mode diagnostic activé",
      detailedConclusion: "L'analyse est en mode diagnostic. Vérifiez les variables d'environnement et les dépendances.",
      recommendations: ["Vérifiez les clés API", "Activez le debug"],
      consultedSources: [
        { title: "BBC News", url: "https://bbc.com", domain: "bbc.com", reliabilityTier: "high", reliabilityLabel: "Très fiable" },
        { title: "Le Monde", url: "https://lemonde.fr", domain: "lemonde.fr", reliabilityTier: "high", reliabilityLabel: "Très fiable" },
        { title: "Reuters", url: "https://reuters.com", domain: "reuters.com", reliabilityTier: "high", reliabilityLabel: "Très fiable" }
      ],
      summary: "Mode diagnostic activé"
    };

    console.log('✅ [API] Réponse envoyée');
    res.json(result);

  } catch (err) {
    console.error('❌ [API] Erreur fatale:', {
      message: err.message,
      stack: err.stack,
    });
    res.status(500).json({ 
      error: 'Erreur interne du serveur',
      message: err.message,
      details: err.stack 
    });
  }
};
