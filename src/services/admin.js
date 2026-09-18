/**
 * Client des actions d'administration.
 *
 * Deux canaux, selon ce que l'action exige :
 *
 *  1. RPC Supabase (`supabase.rpc`) pour tout ce qui vit dans le schéma public.
 *     L'autorisation est vérifiée à l'intérieur de la fonction SQL, et l'audit
 *     est écrit dans la même transaction. Un utilisateur qui appellerait ces
 *     fonctions sans être super admin reçoit une erreur 42501.
 *
 *  2. API Express (`/api/admin/...`) pour les opérations sur `auth.users`, qui
 *     réclament la clé service_role et ne peuvent donc pas partir du navigateur.
 */

import { supabase } from '../lib/supabase';
import { apiFetch } from './api';

/** Traduit les erreurs PostgreSQL en messages lisibles. */
function toFriendlyError(error) {
  const raw = error?.message || 'Erreur inconnue.';

  if (/ACCES_REFUSE/.test(raw)) {
    return new Error("Action refusée : privilèges insuffisants.");
  }
  if (/COMPTE_PROTEGE/.test(raw)) {
    return new Error('Ce compte est protégé et ne peut pas être modifié.');
  }
  if (/PARAMETRE_VERROUILLE/.test(raw)) {
    return new Error('Ce paramètre est verrouillé et ne peut être changé qu\'en SQL.');
  }
  if (/could not find the function|does not exist/i.test(raw)) {
    return new Error(
      'Fonction absente en base. Exécutez les migrations supabase/migrations/ ' +
      '(0001 à 0007) dans le SQL Editor de Supabase, dans cet ordre.'
    );
  }
  if (/structure of query does not match|result type/i.test(raw)) {
    return new Error(
      'Fonction admin_list_users désynchronisée. Exécutez ' +
      'supabase/migrations/0007_fix_admin_list_users.sql dans le SQL Editor.'
    );
  }
  // Les messages de nos fonctions sont préfixés CODE: message
  const match = raw.match(/^[A-Z_]+:\s*(.+)$/);
  return new Error(match ? match[1] : raw);
}

async function rpc(fn, params = {}) {
  const { data, error } = await supabase.rpc(fn, params);
  if (error) throw toFriendlyError(error);
  return data;
}

/* -------------------------------------------------------------------------- */
/* Utilisateurs                                                                */
/* -------------------------------------------------------------------------- */

export async function listUsers({ search = '', role = '', status = '', limit = 50, offset = 0 } = {}) {
  const rpcParams = {
    p_search: search || null,
    p_role: role || null,
    p_status: status || null,
    p_limit: limit,
    p_offset: offset,
  };

  const { data, error } = await supabase.rpc('admin_list_users', rpcParams);
  if (!error) {
    return {
      items: data || [],
      total: Number(data?.[0]?.total_count ?? 0),
      orphans: [],
    };
  }

  const raw = error.message || '';
  /* RPC cassée / absente → on lit profiles directement pour ne pas bloquer l’UI. */
  if (/structure of query|result type|could not find|does not exist/i.test(raw)) {
    return listUsersFromProfiles({ search, role, status, limit, offset });
  }

  throw toFriendlyError(error);
}

async function listUsersFromProfiles({ search = '', role = '', status = '', limit = 50, offset = 0 } = {}) {
  let query = supabase
    .from('profiles')
    .select(
      'id, email, role, username, first_name, last_name, avatar_url, is_verified, is_suspended, suspended_at, suspension_reason, daily_quota_override, last_seen_at, created_at',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + Math.max(limit, 1) - 1);

  if (search.trim()) {
    const term = search.trim().replace(/[%_,]/g, '');
    const q = `%${term}%`;
    query = query.or(
      `email.ilike.${q},username.ilike.${q},first_name.ilike.${q},last_name.ilike.${q}`
    );
  }
  if (role) query = query.eq('role', role);
  if (status === 'suspended') query = query.eq('is_suspended', true);
  if (status === 'active') query = query.eq('is_suspended', false);

  const { data, error, count } = await query;
  if (error) throw toFriendlyError(error);

  const ids = (data || []).map((row) => row.id);
  const counts = new Map();
  if (ids.length) {
    const { data: analyses } = await supabase
      .from('analyses')
      .select('user_id, created_at')
      .in('user_id', ids);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();
    for (const row of analyses || []) {
      const cur = counts.get(row.user_id) || { total: 0, today: 0 };
      cur.total += 1;
      if (row.created_at && new Date(row.created_at).getTime() >= todayMs) cur.today += 1;
      counts.set(row.user_id, cur);
    }
  }

  return {
    items: (data || []).map((row) => {
      const stats = counts.get(row.id) || { total: 0, today: 0 };
      return {
        ...row,
        analyses_count: stats.total,
        analyses_today: stats.today,
        is_root: false,
      };
    }),
    total: count || 0,
    orphans: [],
  };
}

export const purgeOrphanProfiles = () =>
  apiFetch('/admin/users/purge-orphans', { method: 'POST' });

export const setUserRole = (userId, role) =>
  rpc('admin_set_user_role', { p_user_id: userId, p_role: role });

export const setUserSuspension = (userId, suspend, reason = null) =>
  rpc('admin_set_user_suspension', { p_user_id: userId, p_suspend: suspend, p_reason: reason });

export const setUserQuota = (userId, quota) =>
  rpc('admin_set_user_quota', { p_user_id: userId, p_quota: quota });

/* --- Opérations nécessitant la clé service_role --------------------------- */

export const fetchAuthInfo = () => apiFetch('/admin/users/auth-info');

export const createUser = (payload) =>
  apiFetch('/admin/users', { method: 'POST', body: payload });

export const deleteUser = (userId) =>
  apiFetch(`/admin/users/${userId}`, { method: 'DELETE' });

export const sendPasswordReset = (userId) =>
  apiFetch(`/admin/users/${userId}/reset-password`, { method: 'POST' });

export const changeUserEmail = (userId, email) =>
  apiFetch(`/admin/users/${userId}/email`, { method: 'PATCH', body: { email } });

export const revokeSessions = (userId) =>
  apiFetch(`/admin/users/${userId}/revoke-sessions`, { method: 'POST' });

/* -------------------------------------------------------------------------- */
/* Contenus                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * @param {object} options
 * @param {'' | 'members' | 'visitors'} [options.audience] restreint aux
 *   analyses des comptes ou à celles des visiteurs non connectés.
 */
export async function listAnalyses({
  search = '', type = '', status = '', audience = '', limit = 50, offset = 0,
} = {}) {
  const params = {
    p_search: search || null,
    p_type: type || null,
    p_status: status || null,
    p_limit: limit,
    p_offset: offset,
    p_audience: audience || null,
  };

  try {
    const rows = await rpc('admin_list_analyses', params);
    return { items: rows || [], total: rows?.[0]?.total_count ?? 0 };
  } catch (err) {
    /*
     * Signature 0002 sans p_audience : on retombe dessus et on filtre
     * membres/visiteurs en mémoire, le temps que 0005 soit appliquée.
     */
    if (!/Fonction absente|could not find the function|does not exist/i.test(err.message || '')) {
      throw err;
    }
    const { data, error } = await supabase.rpc('admin_list_analyses', {
      p_search: params.p_search,
      p_type: params.p_type,
      p_status: params.p_status,
      p_limit: params.p_limit,
      p_offset: params.p_offset,
    });
    if (error) throw toFriendlyError(error);
    let items = data || [];
    if (audience === 'visitors') items = items.filter((row) => !row.user_id);
    if (audience === 'members') items = items.filter((row) => row.user_id);
    return { items, total: items[0]?.total_count ?? items.length };
  }
}

export const moderateAnalysis = (analysisId, remove, reason = null) =>
  rpc('admin_moderate_analysis', {
    p_analysis_id: analysisId,
    p_remove: remove,
    p_reason: reason,
  });

export const purgeAnalysis = (analysisId) =>
  rpc('admin_delete_analysis', { p_analysis_id: analysisId });

/** Détail complet d'une analyse (les admins y ont accès via RLS). */
export async function getAnalysisDetail(analysisId) {
  const { data, error } = await supabase
    .from('analyses')
    .select('*')
    .eq('id', analysisId)
    .single();
  if (error) throw toFriendlyError(error);
  return data;
}

/* -------------------------------------------------------------------------- */
/* Paramètres système                                                          */
/* -------------------------------------------------------------------------- */

export async function listSettings() {
  const { data, error } = await supabase
    .from('system_settings')
    .select('*')
    .order('category')
    .order('key');
  if (error) throw toFriendlyError(error);
  return data || [];
}

/**
 * Modifie un paramètre puis demande à l'API de vider son cache, afin que le
 * changement s'applique immédiatement au serveur et pas seulement à l'UI.
 */
export async function updateSetting(key, value) {
  const row = await rpc('admin_update_setting', { p_key: key, p_value: String(value) });
  try {
    await apiFetch('/admin/settings/refresh', { method: 'POST' });
  } catch {
    // Le cache serveur expire de lui-même en quelques secondes.
  }
  return row;
}

/* -------------------------------------------------------------------------- */
/* Journaux, statistiques, diffusion                                           */
/* -------------------------------------------------------------------------- */

function asAuditRow(row) {
  if (!row) return row;
  const actor = row.actor && typeof row.actor === 'object' && !Array.isArray(row.actor)
    ? row.actor
    : (row.actor_email ? { email: row.actor_email, role: row.actor_role || null } : null);
  return { ...row, actor };
}

export async function listActivityLogs({
  search = '', severity = '', audience = '', limit = 100, offset = 0,
} = {}) {
  /*
   * Le embed PostgREST `profiles!activity_logs_user_id_fkey` échoue dès que
   * la clé étrangère manque (schéma d'origine sans FK). On passe donc par
   * une RPC qui fait le LEFT JOIN en SQL. Repli : lecture simple + hydratation.
   */
  try {
    const rows = await rpc('admin_list_activity_logs', {
      p_search: search || null,
      p_severity: severity || null,
      p_audience: audience || null,
      p_limit: limit,
      p_offset: offset,
    });
    const items = (rows || []).map(asAuditRow);
    return { items, total: items[0]?.total_count ?? items.length };
  } catch (err) {
    const missingRpc = /Fonction absente|could not find the function|does not exist/i.test(err.message || '');
    if (!missingRpc) throw err;
  }

  let query = supabase
    .from('activity_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (search.trim()) query = query.ilike('action', `%${search.trim()}%`);
  if (severity) query = query.eq('severity', severity);

  const { data, error, count } = await query;
  if (error) throw toFriendlyError(error);

  let items = data || [];
  if (audience === 'visitors') items = items.filter((row) => row.visitor_hash);
  if (audience === 'members') items = items.filter((row) => !row.visitor_hash);

  const ids = [...new Set(items.map((row) => row.user_id).filter(Boolean))];
  if (ids.length) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, role')
      .in('id', ids);
    const byId = new Map((profiles || []).map((p) => [p.id, { email: p.email, role: p.role }]));
    items = items.map((row) => asAuditRow({ ...row, actor: byId.get(row.user_id) || null }));
  } else {
    items = items.map(asAuditRow);
  }

  return { items, total: count || 0 };
}

export const purgeActivityLogs = (olderThanDays) =>
  rpc('admin_purge_activity_logs', { p_older_than_days: olderThanDays });

export const getPlatformStats = (days = 14) => rpc('admin_platform_stats', { p_days: days });

/**
 * Activité des visiteurs non connectés : volumes, visiteurs distincts, série
 * comparée aux membres, et dix empreintes les plus actives sur 24 h.
 */
export const getVisitorStats = (days = 14) => rpc('admin_visitor_stats', { p_days: days });

/** Supprime les analyses anonymes plus anciennes que `days` jours. */
export const purgeAnonymousAnalyses = (days) =>
  rpc('admin_purge_anonymous_analyses', { p_days: days });

export const broadcastNotification = ({ title, body, level = 'info', target = 'all' }) =>
  rpc('admin_broadcast_notification', {
    p_title: title,
    p_body: body || null,
    p_level: level,
    p_target: target,
  });

/** Vérification complète de l'installation (schéma, RPC, service_role, bucket). */
export const runDiagnostics = () => apiFetch('/admin/diagnostics');
