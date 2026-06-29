import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || '' });

const MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

const SYSTEM_PROMPT = `Tu es VerifyNet, un expert mondial en fact-checking et détection de fake news. Tu analyses du contenu pour évaluer sa crédibilité.

Tu dois TOUJOURS répondre en JSON valide avec cette structure exacte :
{
  "score": <nombre de 0 à 100>,
  "verdict": "<string parmi: Très crédible|Crédible|À vérifier|Très douteux|Fake News probable>",
  "summary": "<résumé simple en 2-3 phrases>",
  "claims": ["<affirmation 1>", "<affirmation 2>", ...],
  "analysis": {
    "coherence": "<analyse de la cohérence interne>",
    "sources": "<analyse de la qualité des sources mentionnées>",
    "contradictions": "<contradictions détectées>",
    "suspects": "<éléments suspects ou manipulateurs>",
    "context": "<contexte manquant ou nécessaire>"
  },
  "sources": [
    {"title": "<titre>", "domain": "<domaine>", "date": "<date>", "confidence": <0-100>}
  ],
  "recommendations": ["<recommandation 1>", "<recommandation 2>", ...]
}

Règles de scoring :
- 0-20 : Fake News probable (affirmations manifestement fausses, manipulation évidente)
- 21-40 : Très douteux (incohérences majeures, sources absentes ou douteuses)
- 41-60 : À vérifier (affirmations non vérifiables immédiatement, besoin de contexte)
- 61-80 : Crédible (information cohérente, sources mentionnées, tonalité neutre)
- 81-100 : Très crédible (information vérifiée, sources officielles, contexte complet)

Sois rigoureux, objectif et factuel. Identifie les techniques de manipulation, les biais cognitifs exploités, les affirmations extraordinaires sans preuves.`;

async function analyzeContent(content, metadata = {}) {
  const userMessage = buildUserMessage(content, metadata);

  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.2,
    max_tokens: 2048,
    top_p: 0.9,
    response_format: { type: 'json_object' },
  });

  const responseText = completion.choices[0]?.message?.content;
  if (!responseText) throw new Error('Aucune réponse de l\'IA');

  try {
    const result = JSON.parse(responseText);
    result.score = Math.max(0, Math.min(100, Math.round(result.score || 50)));
    if (!Array.isArray(result.claims)) result.claims = [];
    if (!Array.isArray(result.sources)) result.sources = [];
    if (!Array.isArray(result.recommendations)) result.recommendations = [];
    if (!result.analysis) result.analysis = {};
    return result;
  } catch {
    throw new Error('Réponse IA invalide, veuillez réessayer.');
  }
}

function buildUserMessage(content, metadata) {
  let msg = 'Analyse le contenu suivant pour évaluer sa crédibilité :\n\n';
  if (metadata.title) msg += `Titre : ${metadata.title}\n`;
  if (metadata.author) msg += `Auteur : ${metadata.author}\n`;
  if (metadata.date) msg += `Date : ${metadata.date}\n`;
  if (metadata.source) msg += `Source : ${metadata.source}\n`;
  if (metadata.url) msg += `URL : ${metadata.url}\n`;
  msg += `\n--- Contenu ---\n${content.slice(0, 6000)}`;
  return msg;
}

export { analyzeContent };
