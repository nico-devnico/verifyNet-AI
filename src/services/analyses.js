/**
 * Persistance des analyses dans Supabase.
 *
 * Auparavant l'historique vivait uniquement dans le localStorage : les pages
 * Historique, Dashboard et Super Admin ne pouvaient donc afficher que des
 * données factices. Désormais toute analyse d'un utilisateur connecté est
 * enregistrée en base, ce qui alimente réellement la modération et les
 * statistiques. Les visiteurs anonymes conservent un historique local.
 */

import { supabase } from '../lib/supabase';

const MAX_INPUT_PREVIEW = 500;

function scoreOf(result) {
  return result?.finalScore ?? result?.final_score ?? result?.score ?? null;
}

/**
 * Enregistre une analyse. Ne lève jamais : un échec d'écriture ne doit pas
 * priver l'utilisateur de son résultat, déjà affiché à l'écran.
 * @returns {Promise<{saved: boolean, row?: object, error?: string}>}
 */
export async function saveAnalysis({ userId, type, input, result, source = {} }) {
  if (!userId) return { saved: false, error: 'ANONYMOUS' };

  const row = {
    user_id: userId,
    type,
    input: String(input || '').slice(0, MAX_INPUT_PREVIEW),
    result,
    score: scoreOf(result),
    verdict: result?.verdict ?? null,
    extracted_text: source.extractedText ? String(source.extractedText).slice(0, 50000) : null,
    extraction_method: source.method ?? null,
    extraction_confidence: source.confidence ?? null,
    file_name: source.fileName ?? null,
    file_mime: source.mime ?? null,
    file_size: source.size ?? null,
    page_count: source.pageCount ?? null,
    storage_path: source.storagePath ?? null,
  };

  const { data, error } = await supabase.from('analyses').insert(row).select().single();

  if (error) {
    console.warn('[Analyses] Enregistrement impossible :', error.message);
    return { saved: false, error: error.message };
  }
  return { saved: true, row: data };
}

/** Historique de l'utilisateur courant, avec recherche et filtres appliqués en base. */
export async function listMyAnalyses({
  search = '',
  type = 'all',
  reliability = 'all',
  limit = 50,
  offset = 0,
} = {}) {
  let query = supabase
    .from('analyses')
    .select('*', { count: 'exact' })
    .eq('is_removed', false)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (search.trim()) query = query.ilike('input', `%${search.trim()}%`);
  if (type !== 'all') query = query.eq('type', type);

  if (reliability === 'reliable') query = query.gte('score', 61);
  else if (reliability === 'uncertain') query = query.gte('score', 41).lte('score', 60);
  else if (reliability === 'doubtful') query = query.lt('score', 41);

  const { data, error, count } = await query;
  if (error) throw error;
  return { items: data || [], total: count || 0 };
}

export async function deleteAnalysis(id) {
  const { error } = await supabase.from('analyses').delete().eq('id', id);
  if (error) throw error;
}

export async function deleteAllMyAnalyses(userId) {
  const { error } = await supabase.from('analyses').delete().eq('user_id', userId);
  if (error) throw error;
}

/** Statistiques personnelles calculées en base plutôt que sur un échantillon local. */
export async function getMyStats() {
  const { data, error } = await supabase
    .from('analyses')
    .select('score, type, verdict, created_at')
    .eq('is_removed', false)
    .order('created_at', { ascending: false })
    .limit(1000);

  if (error) throw error;

  const rows = data || [];
  const scored = rows.filter((r) => typeof r.score === 'number');

  const bucket = (min, max) =>
    scored.filter((r) => r.score >= min && r.score <= max).length;

  const byDay = new Map();
  for (let i = 13; i >= 0; i -= 1) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    byDay.set(d.toISOString().slice(0, 10), 0);
  }
  for (const r of rows) {
    const key = String(r.created_at).slice(0, 10);
    if (byDay.has(key)) byDay.set(key, byDay.get(key) + 1);
  }

  return {
    total: rows.length,
    avgScore: scored.length
      ? Math.round(scored.reduce((s, r) => s + r.score, 0) / scored.length)
      : 0,
    distribution: {
      credible: bucket(61, 100),
      uncertain: bucket(41, 60),
      doubtful: bucket(21, 40),
      fake: bucket(0, 20),
    },
    byType: {
      text: rows.filter((r) => r.type === 'text').length,
      url: rows.filter((r) => r.type === 'url').length,
      image: rows.filter((r) => r.type === 'image').length,
      document: rows.filter((r) => r.type === 'document').length,
    },
    series: [...byDay.entries()].map(([day, count]) => ({ day, count })),
  };
}

/** Consommation du quota du jour, calculée côté base (fonction my_usage_today). */
export async function getMyUsage() {
  const { data, error } = await supabase.rpc('my_usage_today');
  if (error) throw error;
  return data;
}

/* -------------------------------------------------------------------------- */
/* Partage public                                                              */
/* -------------------------------------------------------------------------- */

export async function toggleSharing(analysisId, isPublic) {
  const { data, error } = await supabase.rpc('toggle_analysis_sharing', {
    p_analysis_id: analysisId,
    p_public: isPublic,
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function getSharedAnalysis(slug) {
  const { data, error } = await supabase.rpc('get_shared_analysis', { p_slug: slug });
  if (error) throw error;
  return data;
}

/* -------------------------------------------------------------------------- */
/* Archivage du fichier source                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Dépose le fichier analysé dans le bucket privé `analysis-uploads`.
 * Facultatif : si le bucket n'existe pas, l'analyse fonctionne quand même,
 * seul l'archivage est perdu.
 * @returns {Promise<string|null>} chemin de stockage
 */
export async function uploadSourceFile(userId, file) {
  if (!userId || !file) return null;

  const ext = file.name?.split('.').pop()?.toLowerCase() || 'bin';
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from('analysis-uploads')
    .upload(path, file, { contentType: file.type || undefined, upsert: false });

  if (error) {
    console.warn('[Analyses] Archivage du fichier ignoré :', error.message);
    return null;
  }
  return path;
}

/** URL signée temporaire pour relire un fichier archivé. */
export async function getSourceFileUrl(storagePath, expiresInSeconds = 300) {
  if (!storagePath) return null;
  const { data, error } = await supabase.storage
    .from('analysis-uploads')
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}
