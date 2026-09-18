/**
 * Lecture des paramètres système pilotés par le super admin.
 *
 * Les valeurs sont mises en cache pendant quelques secondes : suffisamment
 * court pour qu'un changement dans l'interface super admin s'applique presque
 * immédiatement à toute l'API, suffisamment long pour ne pas interroger la
 * base à chaque requête.
 */

const { admin, anon } = require('../lib/supabase');

const CACHE_TTL_MS = 10_000;

const FALLBACKS = {
  app_name: 'VerifyNet',
  maintenance_mode: 'false',
  maintenance_message: 'VerifyNet est en maintenance. Nous revenons très vite.',
  enable_registrations: 'true',
  allow_anonymous_analysis: 'true',
  max_analyses_per_day: '100',
  max_anonymous_per_day: '5',
  max_upload_size_mb: '15',
  max_text_length: '20000',
  enable_image_analysis: 'true',
  enable_document_analysis: 'true',
  enable_public_sharing: 'true',
  enable_pdf_export: 'true',
  log_anonymous_analyses: 'true',
  anonymous_retention_days: '90',
};

let cache = null;
let cachedAt = 0;

async function loadSettings({ force = false } = {}) {
  const now = Date.now();
  if (!force && cache && now - cachedAt < CACHE_TTL_MS) return cache;

  const client = admin || anon;
  if (!client) {
    cache = { ...FALLBACKS };
    cachedAt = now;
    return cache;
  }

  try {
    const { data, error } = await client.from('system_settings').select('key, value');
    if (error) throw error;

    const next = { ...FALLBACKS };
    for (const row of data || []) next[row.key] = row.value;
    cache = next;
    cachedAt = now;
  } catch (err) {
    console.warn('[Settings] Lecture impossible, valeurs par défaut utilisées :', err.message);
    cache = cache || { ...FALLBACKS };
    cachedAt = now;
  }
  return cache;
}

function invalidate() {
  cache = null;
  cachedAt = 0;
}

const TRUTHY = new Set(['true', 't', '1', 'yes', 'on']);

async function getBool(key, fallback = false) {
  const settings = await loadSettings();
  const raw = settings[key];
  if (raw === undefined || raw === null || raw === '') return fallback;
  return TRUTHY.has(String(raw).toLowerCase());
}

async function getNumber(key, fallback = 0) {
  const settings = await loadSettings();
  const parsed = Number(settings[key]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function getString(key, fallback = '') {
  const settings = await loadSettings();
  return settings[key] ?? fallback;
}

module.exports = { loadSettings, invalidate, getBool, getNumber, getString };
