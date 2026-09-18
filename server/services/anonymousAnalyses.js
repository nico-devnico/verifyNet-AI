/**
 * Enregistrement des analyses lancées sans compte.
 *
 * Une analyse anonyme n'a pas d'auteur capable de l'écrire lui-même : le client
 * n'est pas authentifié, et la politique RLS `analyses_insert_own` exige
 * `auth.uid() = user_id`. C'est donc l'API qui l'enregistre, avec la clé
 * service_role, en renseignant l'identité pseudonyme visiteur.
 *
 * L'écriture privilégie la RPC `record_anonymous_analysis` (hors cache schéma
 * PostgREST). Un insert direct sert de repli si la migration 0005 n'est pas
 * encore appliquée.
 */

const { admin } = require('../lib/supabase');
const settings = require('../services/settings');

const MAX_INPUT_PREVIEW = 500;
const MAX_EXTRACTED_TEXT = 50000;

function scoreOf(result) {
  return result?.finalScore ?? result?.final_score ?? result?.score ?? null;
}

function isMissingColumn(message) {
  return /schema cache|column .* does not exist|could not find the .* column/i.test(message || '');
}

function isNotNullUser(message) {
  return /null value in column ["']?user_id/i.test(message || '');
}

function isMissingRpc(message) {
  return /could not find the function|does not exist/i.test(message || '');
}

async function insertDirect(row, includeVisitor) {
  const payload = includeVisitor
    ? row
    : Object.fromEntries(
        Object.entries(row).filter(([key]) => !['visitor_hash', 'visitor_ip_prefix', 'user_agent'].includes(key))
      );

  return admin.from('analyses').insert(payload).select('id').single();
}

async function insertAudit(visitor, analysisId, type, row) {
  const { error } = await admin.from('activity_logs').insert({
    user_id: null,
    action: 'ANONYMOUS_ANALYSIS',
    severity: 'info',
    visitor_hash: visitor.hash,
    ip_address: visitor.ipPrefix,
    user_agent: visitor.userAgent,
    details: {
      analysis_id: analysisId,
      type,
      score: row.score,
      verdict: row.verdict,
      file_name: row.file_name,
    },
  });

  if (!error) return;
  if (!isMissingColumn(error.message)) {
    console.warn('[Visiteurs] Journal anonyme incomplet :', error.message);
    return;
  }

  const { error: retryError } = await admin.from('activity_logs').insert({
    user_id: null,
    action: 'ANONYMOUS_ANALYSIS',
    severity: 'info',
    ip_address: visitor.ipPrefix,
    user_agent: visitor.userAgent,
    details: {
      analysis_id: analysisId,
      type,
      score: row.score,
      verdict: row.verdict,
      visitor_hash: visitor.hash,
    },
  });
  if (retryError) console.warn('[Visiteurs] Journal anonyme incomplet :', retryError.message);
}

/**
 * Écrit l'analyse anonyme et l'événement d'audit correspondant.
 *
 * Ne lève jamais : à ce stade le visiteur a déjà reçu son résultat, un échec
 * d'écriture ne doit pas se transformer en erreur visible. Les échecs sont
 * seulement journalisés côté serveur.
 *
 * @returns {Promise<{recorded: boolean, id?: string, reason?: string}>}
 */
async function record({ visitor, type, content, result, metadata = {} }) {
  if (!visitor?.hash) return { recorded: false, reason: 'NO_VISITOR' };

  if (!admin) {
    console.warn('[Visiteurs] Analyse anonyme non enregistrée : SUPABASE_SERVICE_ROLE_KEY absente.');
    return { recorded: false, reason: 'NO_SERVICE_ROLE' };
  }

  try {
    if (!(await settings.getBool('log_anonymous_analyses', true))) {
      return { recorded: false, reason: 'DISABLED' };
    }
  } catch {
    // Réglage illisible : on enregistre, la visibilité étant le comportement attendu.
  }

  const isFile = type === 'image' || type === 'document';

  const row = {
    user_id: null,
    type,
    input: String(metadata.url || metadata.fileName || content || '').slice(0, MAX_INPUT_PREVIEW),
    result,
    score: scoreOf(result),
    verdict: result?.verdict ?? null,
    extracted_text: isFile ? String(content || '').slice(0, MAX_EXTRACTED_TEXT) : null,
    extraction_method: metadata.extractionMethod ?? null,
    extraction_confidence: metadata.extractionConfidence ?? null,
    file_name: metadata.fileName ?? null,
    file_mime: metadata.fileMime ?? null,
    file_size: metadata.fileSize ?? null,
    page_count: metadata.pageCount ?? null,
    visitor_hash: visitor.hash,
    visitor_ip_prefix: visitor.ipPrefix,
    user_agent: visitor.userAgent,
  };

  try {
    const { data: rpcId, error: rpcError } = await admin.rpc('record_anonymous_analysis', {
      p_visitor_hash: visitor.hash,
      p_visitor_ip_prefix: visitor.ipPrefix || null,
      p_user_agent: visitor.userAgent || null,
      p_type: type,
      p_input: row.input,
      p_result: result || {},
      p_score: row.score,
      p_verdict: row.verdict,
      p_extracted_text: row.extracted_text,
      p_extraction_method: row.extraction_method,
      p_extraction_confidence: row.extraction_confidence,
      p_file_name: row.file_name,
      p_file_mime: row.file_mime,
      p_file_size: row.file_size,
      p_page_count: row.page_count,
    });

    if (!rpcError) {
      if (!rpcId) return { recorded: false, reason: 'DISABLED' };
      return { recorded: true, id: rpcId };
    }

    if (!isMissingRpc(rpcError.message)) {
      console.warn('[Visiteurs] Analyse anonyme non enregistrée :', rpcError.message);
      if (isNotNullUser(rpcError.message)) {
        console.warn('[Visiteurs] Exécutez supabase/migrations/0005_admin_visibility_fixes.sql (user_id NOT NULL).');
      }
      return { recorded: false, reason: rpcError.message };
    }

    let { data, error } = await insertDirect(row, true);

    if (error && isMissingColumn(error.message)) {
      ({ data, error } = await insertDirect(row, false));
    }

    if (error) {
      console.warn('[Visiteurs] Analyse anonyme non enregistrée :', error.message);
      if (isNotNullUser(error.message)) {
        console.warn('[Visiteurs] Exécutez supabase/migrations/0005_admin_visibility_fixes.sql (user_id NOT NULL).');
      }
      return { recorded: false, reason: error.message };
    }

    await insertAudit(visitor, data.id, type, row);
    return { recorded: true, id: data.id };
  } catch (err) {
    console.warn('[Visiteurs] Analyse anonyme non enregistrée :', err.message);
    return { recorded: false, reason: err.message };
  }
}

module.exports = { record };
