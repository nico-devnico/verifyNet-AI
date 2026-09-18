/**
 * Enregistrement des analyses lancées sans compte.
 *
 * Une analyse anonyme n'a pas d'auteur capable de l'écrire lui-même : le client
 * n'est pas authentifié, et la politique RLS `analyses_insert_own` exige
 * `auth.uid() = user_id`. C'est donc l'API qui l'enregistre, avec la clé
 * service_role, en renseignant l'identité pseudonyme du visiteur.
 *
 * Sans cela, l'activité des visiteurs restait confinée au localStorage de leur
 * navigateur et la console super admin sous-estimait le trafic réel.
 */

const { admin } = require('../lib/supabase');
const settings = require('../services/settings');

const MAX_INPUT_PREVIEW = 500;
const MAX_EXTRACTED_TEXT = 50000;

function scoreOf(result) {
  return result?.finalScore ?? result?.final_score ?? result?.score ?? null;
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
    const { data, error } = await admin
      .from('analyses')
      .insert(row)
      .select('id')
      .single();

    if (error) {
      console.warn('[Visiteurs] Analyse anonyme non enregistrée :', error.message);
      return { recorded: false, reason: error.message };
    }

    /*
     * Trace d'audit distincte de la ligne d'analyse : elle donne au super admin
     * un fil chronologique unique, mêlant actions des membres et des visiteurs.
     * L'écriture passe par le client service_role, donc `auth.uid()` est nul et
     * le trigger de garde de 0003 laisse passer.
     */
    const { error: logError } = await admin.from('activity_logs').insert({
      user_id: null,
      action: 'ANONYMOUS_ANALYSIS',
      severity: 'info',
      visitor_hash: visitor.hash,
      ip_address: visitor.ipPrefix,
      user_agent: visitor.userAgent,
      details: {
        analysis_id: data.id,
        type,
        score: row.score,
        verdict: row.verdict,
        file_name: row.file_name,
      },
    });

    if (logError) {
      console.warn('[Visiteurs] Journal anonyme incomplet :', logError.message);
    }

    return { recorded: true, id: data.id };
  } catch (err) {
    console.warn('[Visiteurs] Analyse anonyme non enregistrée :', err.message);
    return { recorded: false, reason: err.message };
  }
}

module.exports = { record };
