import Groq from 'groq-sdk';
import { searchWeb, RELIABLE_SOURCES, fetchPageContent } from './webSearch.js';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || '' });

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

async function callModelWithFallback(systemPrompt, userMessage, maxTokens = 2048, requireJson = true) {
  let lastError;

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
        max_tokens: Math.min(maxTokens, 2048),
        top_p: 0.9,
        response_format: requireJson ? { type: 'json_object' } : undefined,
      });
      
      let text = completion.choices[0]?.message?.content;
      if (!text) throw new Error('Empty response');
      
      if (requireJson) {
        text = text
          .replace(/<think>[\s\S]*?<\/think>/gi, '')
          .replace(/<tool>[\s\S]*?<\/tool>/gi, '')
          .replace(/<output>[\s\S]*?<\/output>/gi, '')
          .replace(/```json|```/gi, '')
          .trim();
        
        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          text = text.substring(firstBrace, lastBrace + 1);
        }
        
        console.log(`[Model] Success with ${modelId}`);
        return JSON.parse(text);
      } else {
        console.log(`[Model] Success with ${modelId}`);
        return text;
      }
    } catch (err) {
      console.warn(`[Model] Failed with ${modelId}:`, err.message);
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
  
  const truncatedContent = content.substring(0, 2000);
  let userMsg = `Contenu: ${truncatedContent}`;
  if (metadata.title) {
    userMsg = `Titre: ${metadata.title}\n${userMsg}`;
  }
  
  try {
    return await callModelWithFallback(systemPrompt, userMsg, 256);
  } catch (err) {
    return {
      mainTopic: "Contenu à vérifier",
      country: null,
      claim: metadata.title || "Affirmation non spécifiée",
      language: "fr"
    };
  }
}

async function stepSummarizeSources(claim, searchResults) {
  const sourcesToScrape = searchResults.reliableSources.slice(0, 2);
  const scrapedContents = [];

  for (const source of sourcesToScrape) {
    try {
      console.log(`[Summarize] Scraping: ${source.url}`);
      const content = await fetchPageContent(source.url);
      if (content) {
        scrapedContents.push({
          title: source.title,
          domain: source.domain,
          url: source.url,
          content: content.substring(0, 4000),
        });
      }
    } catch (err) {
      console.error(`[Summarize] Error scraping ${source.url}:`, err.message);
    }
  }

  if (scrapedContents.length === 0) {
    return null;
  }

  const systemPrompt = `Tu es VerifyNet, expert en résumé de sources pour vérification d'informations.
Rédige un résumé détaillé en français basé UNIQUEMENT sur les contenus fournis.
Le résumé doit synthétiser les informations clés des sources et leur rapport avec l'affirmation.`;
  
  const userMsg = `Affirmation: "${claim}"\n\nContenus des sources:\n${scrapedContents.map(s => `--- ${s.title} (${s.domain}) ---\n${s.content}`).join('\n')}`;

  try {
    return await callModelWithFallback(systemPrompt, userMsg, 1000, false);
  } catch (err) {
    console.error("[Summarize] Error generating source summary:", err);
    return null;
  }
}

async function stepAnalyzeSources(claim, searchResults) {
  const sourcesToAnalyze = [
    ...searchResults.reliableSources.slice(0, 4),
    ...searchResults.otherSources.slice(0, 2)
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

async function stepFinalAnalysis(claim, extraction, sourceAnalyses, searchResults, sourceSummary) {
  const systemPrompt = `Tu es VerifyNet, expert en vérification d'informations.
Donne un verdict, un score 0-100 ET une conclusion détaillée basée UNIQUEMENT sur les sources fournies.
Retourne JSON :
{
  "claim": "${claim}",
  "topicSummary": "Résumé court du sujet",
  "finalScore": 50,
  "verdict": "Très probable/Probable/Incertain/Peu probable/Très peu probable",
  "analysis": {"verifiedFacts": [], "doubtfulPoints": [], "falseClaims": [], "missingContext": ""},
  "sourceComparison": {"totalSources":0,"confirmingHighReliability":0,"denyingHighReliability":0,"neutralHighReliability":0,"otherSources":0},
  "sourceDisagreements": [],
  "reasoning": "Raisonnement concis",
  "detailedConclusion": "Conclusion textuelle détaillée d'au moins 300 mots : résume l'analyse, cite les sources, explique le score et le verdict, donne des recommandations.",
  "recommendations": ["Vérifiez les sources", "Consultez plusieurs sources"]
}`;
  
  const simplifiedSources = sourceAnalyses.sourceAnalyses?.slice(0, 3) || [];
  let userMsg = `Affirmation: ${claim}\nSources:${JSON.stringify(simplifiedSources)}`;
  
  if (sourceSummary) {
    userMsg += `\n\nRésumé des sources:\n${sourceSummary}`;
  }
  
  try {
    return await callModelWithFallback(systemPrompt, userMsg, 3000);
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
      detailedConclusion: "L'analyse n'a pas pu générer de conclusion détaillée car les modèles IA n'ont pas répondu. Veuillez consulter les sources ci-dessous pour vérifier cette affirmation.",
      recommendations: ["Vérifiez les sources fiables ci-dessous", "Consultez plusieurs sources"]
    };
  }
}

async function analyzeWithFusion(content, metadata = {}, onProgress = null) {
  const sendProgress = (progress, step) => {
    console.log(`[Étape ${progress}/6] ${step}`);
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
  
  sendProgress(3, 'Scraping et résumé des sources...');
  const sourceSummary = await stepSummarizeSources(extraction.claim, searchResults);
  sendProgress(3, 'Résumé des sources généré');
  
  sendProgress(4, 'Analyse critique des sources...');
  let sourceAnalyses;
  try {
    sourceAnalyses = await stepAnalyzeSources(extraction.claim, searchResults);
  } catch (e) {
    console.log("StepAnalyzeSources failed, using search results directly");
    sourceAnalyses = { sourceAnalyses: [], convergences: [], divergences: [], keyFindings: [] };
  }
  sendProgress(4, 'Analyse des sources terminée');
  
  sendProgress(5, 'Analyse finale et conclusion nuancée...');
  let finalAnalysis;
  try {
    finalAnalysis = await stepFinalAnalysis(extraction.claim, extraction, sourceAnalyses, searchResults, sourceSummary);
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
      detailedConclusion: "L'analyse n'a pas pu générer de conclusion détaillée car les modèles IA n'ont pas répondu. Veuillez consulter les sources ci-dessous pour vérifier cette affirmation.",
      recommendations: ["Vérifiez les sources fiables ci-dessous", "Consultez plusieurs sources"]
    };
  }
  sendProgress(5, 'Analyse finale terminée');
  
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
    detailedConclusion: finalAnalysis.detailedConclusion,
    sourceSummary: sourceSummary,
    recommendations: finalAnalysis.recommendations,
    consultedSources: finalConsultedSources,
    firstAppearance: finalAnalysis.firstAppearance || searchResults.firstAppearance,
    circulationPlatforms: finalAnalysis.circulationPlatforms || searchResults.circulatingOn.map(c => c.site),
    summary: 'Analyse de l\'affirmation : "' + extraction.claim + '"\n' + (finalAnalysis.reasoning || '')
  };
  
  sendProgress(6, 'Rapport complet généré');
  return finalResult;
}

export { analyzeWithFusion };
