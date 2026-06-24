const Groq = require('groq-sdk');
const { searchWeb, RELIABLE_SOURCES } = require('./webSearch');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || '' });

// List of allowed models in priority order exactly as requested by user!
const ALLOWED_MODELS = [
  'groq/compound',
  'groq/compound-mini',
  'llama-3.1-8b-instant',
  'llama-3.3-70b-versatile',
  'qwen3-32b',
  'qwen3.6-27b'
];

function clamp(v) { 
  return Math.max(0, Math.min(100, Math.round(v)));
}

async function callModelWithFallback(systemPrompt, userMessage, maxTokens = 2048) {
  let lastError;

  // Truncate user message to prevent "Request too large" errors
  const truncatedUserMessage = userMessage.length > 3000 
    ? userMessage.substring(0, 3000) + "..." 
    : userMessage;

  for (const modelId of ALLOWED_MODELS) {
    try {
      console.log(`[Model] Trying model: ${modelId}`);
      const completion = await groq.chat.completions.create({
        model: modelId,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: truncatedUserMessage },
        ],
        temperature: 0.1,
        max_tokens: Math.min(maxTokens, 2048), // Reduced from 3500
        top_p: 0.9,
        response_format: { type: 'json_object' },
      });
      
      let text = completion.choices[0]?.message?.content;
      if (!text) throw new Error('Empty response');
      
      // Clean response
      text = text
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/<tool>[\s\S]*?<\/tool>/gi, '')
        .replace(/<output>[\s\S]*?<\/output>/gi, '')
        .replace(/```json|```/gi, '')
        .trim();
      
      // Extract valid JSON
      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        text = text.substring(firstBrace, lastBrace + 1);
      }
      
      console.log(`[Model] Success with ${modelId}`);
      return JSON.parse(text);
    } catch (err) {
      console.warn(`[Model] Failed with ${modelId}: ${err.message}`);
      lastError = err;
    }
  }

  throw new Error(`All models failed. Last error: ${lastError?.message || 'Unknown'}`);
}

async function stepExtractStructured(content, metadata = {}) {
  const systemPrompt = `Tu es un expert en analyse de contenu pour vérification d'informations.
Extraie les informations clés.
Retourne UNIQUEMENT JSON :
{
  "mainTopic": "sujet principal",
  "country": "pays ou null",
  "claim": "affirmation principale",
  "language": "fr"
}`;
  
  // Truncate content to save tokens
  const truncatedContent = content.substring(0, 2000);
  let userMsg = `Contenu: ${truncatedContent}`;
  if (metadata.title) {
    userMsg = `Titre: ${metadata.title}\n${userMsg}`;
  }
  
  try {
    return await callModelWithFallback(systemPrompt, userMsg, 256);
  } catch (err) {
    // Fallback to simple extraction
    return {
      mainTopic: "Contenu à vérifier",
      country: null,
      claim: metadata.title || "Affirmation non spécifiée",
      language: "fr"
    };
  }
}

async function stepAnalyzeSources(claim, searchResults) {
  // Reduce number of sources to save tokens
  const sourcesToAnalyze = [
    ...searchResults.reliableSources.slice(0, 4), // Reduced from 8 to 4
    ...searchResults.otherSources.slice(0, 2)    // Reduced from 4 to 2
  ];
  
  const systemPrompt = `Tu es un expert en vérification.
Pour chaque source, indique:
1. stance: confirme/infirme/neutre/non pertinent
2. justification: 1 phrase max
3. credibilityScore: 0-100
Retourne JSON :
{
  "sourceAnalyses": [{"url":"", "domain":"", "title":"", "reliabilityTier":"", "stance":"", "justification":"", "credibilityScore":0}],
  "convergences": [],
  "divergences": [],
  "keyFindings": []
}`;
  
  // Simplify source data to save tokens
  const simplifiedSources = sourcesToAnalyze.map(s => ({
    url: s.url,
    domain: s.domain,
    title: s.title.substring(0, 100),
    snippet: s.snippet?.substring(0, 200) || "",
    reliability: s.reliability
  }));
  
  try {
    return await callModelWithFallback(systemPrompt, `Affirmation: "${claim}"\nSources:${JSON.stringify(simplifiedSources)}`, 1536);
  } catch (err) {
    console.log("StepAnalyzeSources: Falling back to minimal analysis");
    return {
      sourceAnalyses: simplifiedSources.map(s => ({
        url: s.url,
        domain: s.domain,
        title: s.title,
        reliabilityTier: s.reliability,
        stance: "neutre",
        justification: "Source trouvée via recherche web",
        credibilityScore: s.reliability === 'high' ? 90 : s.reliability === 'institutional' ? 85 : s.reliability === 'scientific' ? 80 : s.reliability === 'factchecking' ? 95 : 40
      })),
      convergences: [],
      divergences: [],
      keyFindings: []
    };
  }
}

async function stepFinalAnalysis(claim, extraction, sourceAnalyses, searchResults) {
  const systemPrompt = `Tu es VerifyNet.
Donne un verdict et un score 0-100.
Retourne JSON :
{
  "claim": "${claim}",
  "topicSummary": "Résumé court",
  "finalScore": 50,
  "verdict": "Très probable/Probable/Incertain/Peu probable/Très peu probable",
  "analysis": {"verifiedFacts": [], "doubtfulPoints": [], "falseClaims": [], "missingContext": ""},
  "sourceComparison": {"totalSources":0,"confirmingHighReliability":0,"denyingHighReliability":0,"neutralHighReliability":0,"otherSources":0},
  "sourceDisagreements": [],
  "reasoning": "Raisonnement concis",
  "recommendations": ["Vérifiez les sources", "Consultez plusieurs sources"]
}`;
  
  // Simplify data to save tokens
  const simplifiedSources = sourceAnalyses.sourceAnalyses?.slice(0, 3) || [];
  
  try {
    return await callModelWithFallback(systemPrompt, `Affirmation: ${claim}\nSources:${JSON.stringify(simplifiedSources)}`, 1536);
  } catch (err) {
    console.log("StepFinalAnalysis: Falling back to minimal final analysis");
    return {
      claim: claim,
      topicSummary: "Analyse de l'affirmation",
      finalScore: 50,
      verdict: "Incertain",
      analysis: {
        verifiedFacts: [],
        doubtfulPoints: [],
        falseClaims: [],
        missingContext: "Analyse approfondie indisponible, consultez les sources ci-dessous"
      },
      sourceComparison: {
        totalSources: searchResults.allSources.length,
        confirmingHighReliability: 0,
        denyingHighReliability: 0,
        neutralHighReliability: searchResults.reliableSources.length,
        otherSources: searchResults.otherSources.length
      },
      sourceDisagreements: [],
      reasoning: "Veuillez consulter les sources ci-dessous pour vérifier cette affirmation.",
      recommendations: ["Vérifiez les sources fiables ci-dessous", "Consultez plusieurs sources"]
    };
  }
}

async function analyzeWithFusion(content, metadata = {}, onProgress = null) {
  const sendProgress = (progress, step) => {
    console.log(`[Étape ${progress}/5] ${step}`);
    if (onProgress) onProgress({ progress, step });
  };
  
  sendProgress(1, 'Extraction des informations clés...');
  const extraction = await stepExtractStructured(content, metadata);
  
  if (!extraction.claim || extraction.claim === 'null') {
    extraction.claim = extraction.mainTopic;
  }
  
  sendProgress(1, 'Extrait : ' + extraction.mainTopic);
  
  sendProgress(2, 'Recherche web approfondie...');
  const searchResults = await searchWeb(extraction.claim, extraction.mainTopic, extraction.country);
  sendProgress(2, searchResults.allSources.length + ' sources trouvées (' + searchResults.reliableSources.length + ' fiables)');
  
  sendProgress(3, 'Analyse critique des sources...');
  let sourceAnalyses;
  try {
    sourceAnalyses = await stepAnalyzeSources(extraction.claim, searchResults);
  } catch (e) {
    console.log("StepAnalyzeSources failed, using search results directly");
    sourceAnalyses = { sourceAnalyses: [], convergences: [], divergences: [], keyFindings: [] };
  }
  sendProgress(3, 'Analyse des sources terminée');
  
  sendProgress(4, 'Analyse finale et conclusion nuancée...');
  let finalAnalysis;
  try {
    finalAnalysis = await stepFinalAnalysis(extraction.claim, extraction, sourceAnalyses, searchResults);
  } catch (e) {
    console.log("StepFinalAnalysis failed, using minimal analysis");
    finalAnalysis = {
      claim: extraction.claim,
      topicSummary: "Analyse de l'affirmation",
      finalScore: 50,
      verdict: "Incertain",
      analysis: {
        verifiedFacts: [],
        doubtfulPoints: [],
        falseClaims: [],
        missingContext: "Analyse approfondie indisponible"
      },
      sourceComparison: {
        totalSources: searchResults.allSources.length,
        confirmingHighReliability: 0,
        denyingHighReliability: 0,
        neutralHighReliability: searchResults.reliableSources.length,
        otherSources: searchResults.otherSources.length
      },
      sourceDisagreements: [],
      reasoning: "Veuillez consulter les sources ci-dessous.",
      recommendations: ["Vérifiez les sources fiables ci-dessous"]
    };
  }
  sendProgress(4, 'Analyse finale terminée');
  
  const getReliabilityLabel = (tier) => {
    return tier === 'high' ? 'Très fiable' :
           tier === 'institutional' ? 'Institutionnel' :
           tier === 'scientific' ? 'Scientifique' :
           tier === 'factchecking' ? 'Fact-checking' :
           'À utiliser avec prudence';
  };
  
  const allSources = [...searchResults.reliableSources, ...searchResults.otherSources.slice(0, 15)];
  const finalConsultedSources = allSources.map(s => ({
    title: s.title,
    url: s.url,
    domain: s.domain,
    reliabilityTier: s.reliability,
    reliabilityLabel: getReliabilityLabel(s.reliability),
    stance: 'neutre',
    credibilityScore: s.reliability === 'high' ? 90 : s.reliability === 'institutional' ? 85 : s.reliability === 'scientific' ? 80 : s.reliability === 'factchecking' ? 95 : 40
  }));
  
  const finalResult = {
    mainTopic: extraction.mainTopic,
    country: extraction.country,
    claim: extraction.claim,
    topicSummary: finalAnalysis.topicSummary,
    finalScore: clamp(finalAnalysis.finalScore),
    verdict: finalAnalysis.verdict,
    analysis: finalAnalysis.analysis,
    sourceComparison: finalAnalysis.sourceComparison,
    sourceDisagreements: finalAnalysis.sourceDisagreements || [],
    reasoning: finalAnalysis.reasoning,
    recommendations: finalAnalysis.recommendations,
    consultedSources: finalConsultedSources,
    firstAppearance: finalAnalysis.firstAppearance || searchResults.firstAppearance,
    circulationPlatforms: finalAnalysis.circulationPlatforms || searchResults.circulatingOn.map(c => c.site),
    summary: 'Analyse de l\'affirmation : "' + extraction.claim + '"\n' + (finalAnalysis.reasoning || '')
  };
  
  sendProgress(5, 'Rapport complet généré');
  return finalResult;
}

module.exports = { analyzeWithFusion };
