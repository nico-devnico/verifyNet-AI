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
      '(0001 à 0004) dans le SQL Editor de Supabase, dans cet ordre.'
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
  const rows = await rpc('admin_list_users', {
    p_search: search || null,
    p_role: role || null,
    p_status: status || null,
    p_limit: limit,
    p_offset: offset,
  });
  return { items: rows || [], total: rows?.[0]?.total_count ?? 0 };
}

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
  const rows = await rpc('admin_list_analyses', {
    p_search: search || null,
    p_type: type || null,
    p_status: status || null,
    p_limit: limit,
    p_offset: offset,
    p_audience: audience || null,
  });
  return { items: rows || [], total: rows?.[0]?.total_count ?? 0 };
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

export async function listActivityLogs({
  search = '', severity = '', audience = '', limit = 100, offset = 0,
} = {}) {
  let query = supabase
    .from('activity_logs')
    .select('*, actor:profiles!activity_logs_user_id_fkey(email, role)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (search.trim()) {
    const term = `%${search.trim()}%`;
    query = query.or(`action.ilike.${term},visitor_hash.ilike.${term}`);
  }
  if (severity) query = query.eq('severity', severity);
  if (audience === 'visitors') query = query.not('visitor_hash', 'is', null);
  if (audience === 'members') query = query.is('visitor_hash', null);

  const { data, error, count } = await query;
  if (error) throw toFriendlyError(error);
  return { items: data || [], total: count || 0 };
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
