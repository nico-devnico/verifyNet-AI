import { supabase } from '../lib/supabase';

const API_BASE = '/api';

/** Erreur d'API portant le code renvoyé par le serveur (MAINTENANCE_MODE, QUOTA_EXCEEDED…). */
export class ApiError extends Error {
  constructor(message, code, status) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

/** Le JWT est joint à chaque appel : le serveur peut ainsi appliquer rôle et quota. */
async function authHeaders() {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

export async function apiFetch(path, { method = 'GET', body, signal } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(await authHeaders()),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      payload.error || `La requête a échoué (${res.status}).`,
      payload.code,
      res.status
    );
  }
  return payload;
}

/* -------------------------------------------------------------------------- */
/* Analyse en streaming (Server-Sent Events)                                   */
/* -------------------------------------------------------------------------- */

/**
 * Lance une analyse et relaie la progression au fur et à mesure.
 *
 * Le serveur répond en JSON (et non en SSE) quand il refuse la requête avant
 * de commencer — maintenance, quota dépassé, fonctionnalité désactivée. On
 * détecte ce cas via le Content-Type pour remonter un code d'erreur exploitable
 * plutôt qu'un message générique.
 */
async function streamAnalysis(endpoint, payload, onProgress, signal) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(payload),
    signal,
  });

  const contentType = res.headers.get('content-type') || '';

  if (!res.ok || !contentType.includes('text/event-stream')) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(
      data.error || "L'analyse n'a pas pu démarrer.",
      data.code,
      res.status
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result = null;
  let failure = null;

  const consume = (chunk) => {
    buffer += chunk;
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';

    for (const frame of frames) {
      if (!frame.trim()) continue;

      let event = null;
      let data = '';
      for (const line of frame.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('event:')) event = trimmed.slice(6).trim();
        else if (trimmed.startsWith('data:')) data += trimmed.slice(5).trim();
      }
      if (!event || !data) continue;

      let parsed;
      try {
        parsed = JSON.parse(data);
      } catch {
        continue;
      }

      if (event === 'progress') onProgress?.(parsed.progress, parsed.step);
      else if (event === 'complete') result = parsed;
      else if (event === 'error') failure = new ApiError(parsed.error, parsed.code, 502);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    consume(decoder.decode(value, { stream: true }));
  }

  if (failure) throw failure;
  if (!result) {
    throw new ApiError(
      "La connexion a été interrompue avant la fin de l'analyse.",
      'STREAM_INCOMPLETE'
    );
  }
  return result;
}

export const analyzeText = (text, onProgress, signal) =>
  streamAnalysis('/analyze/text', { text }, onProgress, signal);

export const analyzeUrl = (url, onProgress, signal) =>
  streamAnalysis('/analyze/url', { url }, onProgress, signal);

/**
 * Analyse d'un texte extrait localement d'une image ou d'un document.
 * @param {'image'|'document'} kind
 * @param {string} text texte extrait (éventuellement corrigé par l'utilisateur)
 * @param {object} source métadonnées du fichier d'origine
 */
export const analyzeExtracted = (kind, text, source, onProgress, signal) =>
  streamAnalysis(`/analyze/${kind}`, { text, source }, onProgress, signal);

/* -------------------------------------------------------------------------- */
/* Divers                                                                      */
/* -------------------------------------------------------------------------- */

export const healthCheck = () => apiFetch('/health');

/** Réglages publics et capacités du serveur (clés IA présentes, service_role…). */
export const fetchServerConfig = () => apiFetch('/config');
