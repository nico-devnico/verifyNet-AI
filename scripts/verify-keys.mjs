#!/usr/bin/env node
/**
 * Vérifie que les clés d'API du backend sont valides, en interrogeant
 * réellement chaque service.
 *
 *   npm run verify:keys              tout, y compris les appels réseau
 *   npm run verify:keys -- --offline forme des clés seulement
 *
 * Un simple test de présence ne dit rien : une clé peut être présente mais
 * révoquée, mal copiée, ou son quota épuisé. Ce script fait donc un appel
 * minimal à chaque service et rapporte, quand l'information est disponible,
 * le quota restant. En mode `--offline`, il se limite aux contrôles de forme,
 * qui ne transmettent rien.
 *
 * Aucune clé n'est affichée : seuls sa longueur et son préfixe apparaissent,
 * de quoi repérer une erreur de copie sans exposer le secret dans un terminal
 * ou un journal de CI.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', cyan: '\x1b[36m',
};

function readEnv(relativePath) {
  const file = resolve(ROOT, relativePath);
  if (!existsSync(file)) return {};

  const out = {};
  for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

const results = [];

function record(ok, name, detail = '', { warn = false } = {}) {
  results.push({ ok, name, warn });
  const mark = ok ? `${C.green}✓${C.reset}` : warn ? `${C.yellow}!${C.reset}` : `${C.red}✗${C.reset}`;
  console.log(`  ${mark} ${name}${detail ? ` ${C.dim}— ${detail}${C.reset}` : ''}`);
}

/** Empreinte non sensible : de quoi diagnostiquer une clé mal collée. */
function fingerprint(key) {
  if (!key) return 'absente';
  const prefix = key.slice(0, 4).replace(/[^\w-]/g, '');
  return `${key.length} caractères, commence par « ${prefix}… »`;
}

function isPlaceholder(value) {
  return !value || /your_|_here|VOTRE_|xxx/i.test(value);
}

/* -------------------------------------------------------------------------- */
/* Contrôles hors ligne                                                        */
/* -------------------------------------------------------------------------- */

/*
 * Ces vérifications n'envoient rien sur le réseau. Elles attrapent les fautes
 * les plus courantes — clé tronquée au copier-coller, guillemets inclus, clé
 * anon collée à la place de la service_role — avant même de solliciter les
 * services distants.
 */

const SHAPES = {
  GROQ_API_KEY: {
    label: 'Groq',
    test: (v) => /^gsk_[A-Za-z0-9]{40,}$/.test(v),
    expected: 'préfixe « gsk_ » suivi d\'au moins 40 caractères alphanumériques',
  },
  SERPAPI_KEY: {
    label: 'SerpAPI',
    test: (v) => /^[a-f0-9]{64}$/.test(v),
    expected: '64 caractères hexadécimaux minuscules',
  },
};

function checkShape(envName, value) {
  const shape = SHAPES[envName];
  if (!shape || isPlaceholder(value)) return;

  record(shape.test(value), `${shape.label} — format de la clé plausible`,
    shape.test(value) ? fingerprint(value) : `attendu : ${shape.expected}`);
}

/** Décode la charge utile d'un JWT sans vérifier sa signature. */
function decodeJwtPayload(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const json = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64')
      .toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Une clé Supabase est un JWT dont la charge utile annonce le rôle. Confondre
 * `anon` et `service_role` est l'erreur la plus fréquente, et elle ne se
 * manifeste qu'au moment de la première action admin.
 */
function checkSupabaseKeyRole(envName, token, expectedRole) {
  if (isPlaceholder(token)) return;

  const payload = decodeJwtPayload(token);
  if (!payload) {
    record(false, `Supabase — ${envName} lisible`, 'ce n\'est pas un JWT valide');
    return;
  }

  const role = payload.role || '(aucun)';
  record(role === expectedRole, `Supabase — ${envName} porte le rôle « ${expectedRole} »`,
    role === expectedRole
      ? `projet ${payload.ref || '?'}`
      : `rôle trouvé : « ${role} » — clés probablement interverties`);

  if (typeof payload.exp === 'number') {
    const expiry = new Date(payload.exp * 1000);
    const days = Math.round((expiry - Date.now()) / 86400000);
    record(days > 0, `Supabase — ${envName} non expirée`,
      days > 0
        ? `valable encore ${days} jours (${expiry.toISOString().slice(0, 10)})`
        : `expirée depuis le ${expiry.toISOString().slice(0, 10)}`);
  }
}

/* -------------------------------------------------------------------------- */

async function checkGroq(key, model) {
  if (isPlaceholder(key)) {
    record(false, 'Groq — clé renseignée', 'valeur absente ou encore à remplacer dans server/.env');
    return;
  }
  record(true, 'Groq — clé renseignée', fingerprint(key));

  let res;
  try {
    res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
    });
  } catch (err) {
    record(false, 'Groq — clé acceptée par l\'API', `réseau injoignable : ${err.message}`);
    return;
  }

  if (res.status === 401) {
    record(false, 'Groq — clé acceptée par l\'API',
      'refusée (401) : clé invalide ou révoquée — régénérez-la sur console.groq.com/keys');
    return;
  }
  if (!res.ok) {
    record(false, 'Groq — clé acceptée par l\'API', `HTTP ${res.status}`);
    return;
  }

  const body = await res.json().catch(() => null);
  const ids = (body?.data || []).map((m) => m.id);
  record(true, 'Groq — clé acceptée par l\'API', `${ids.length} modèle(s) accessible(s)`);

  /*
   * Le modèle configuré doit figurer dans la liste : depuis août 2026 les
   * modèles Llama sont réservés aux comptes entreprise, et une clé gratuite
   * échouerait à la première analyse sans que rien ne le laisse prévoir.
   */
  if (!model) {
    record(false, 'Groq — modèle configuré', 'GROQ_MODEL absent de server/.env', { warn: true });
  } else if (ids.includes(model)) {
    record(true, 'Groq — modèle configuré disponible', model);
  } else {
    const suggestion = ids.find((id) => /gpt-oss|mixtral|gemma/.test(id)) || ids[0];
    record(false, 'Groq — modèle configuré disponible',
      `« ${model} » inaccessible avec cette clé${suggestion ? ` — essayez « ${suggestion} »` : ''}`);
  }
}

async function checkSerpApi(key) {
  if (isPlaceholder(key)) {
    record(false, 'SerpAPI — clé renseignée', 'valeur absente ou encore à remplacer dans server/.env');
    return;
  }
  record(true, 'SerpAPI — clé renseignée', fingerprint(key));

  let res;
  try {
    // `account` ne consomme pas de recherche et renvoie l'état du quota.
    res = await fetch(`https://serpapi.com/account?api_key=${encodeURIComponent(key)}`);
  } catch (err) {
    record(false, 'SerpAPI — clé acceptée par l\'API', `réseau injoignable : ${err.message}`);
    return;
  }

  const body = await res.json().catch(() => null);

  if (res.status === 401 || body?.error) {
    record(false, 'SerpAPI — clé acceptée par l\'API',
      body?.error || 'refusée (401) : clé invalide — vérifiez serpapi.com/manage-api-key');
    return;
  }
  if (!res.ok) {
    record(false, 'SerpAPI — clé acceptée par l\'API', `HTTP ${res.status}`);
    return;
  }

  const left = body?.total_searches_left;
  const used = body?.this_month_usage;
  const limit = body?.searches_per_month;
  record(true, 'SerpAPI — clé acceptée par l\'API',
    typeof left === 'number' ? `${left} recherche(s) restante(s)` : 'compte accessible');

  if (typeof left === 'number' && left <= 0) {
    record(false, 'SerpAPI — quota disponible',
      `épuisé (${used}/${limit} ce mois) : les analyses tomberont en recherche dégradée`, { warn: true });
  } else if (typeof left === 'number') {
    record(true, 'SerpAPI — quota disponible', `${used ?? '?'}/${limit ?? '?'} utilisé(s) ce mois`);
  }
}

async function checkSupabase(url, anonKey, serviceKey) {
  if (isPlaceholder(url) || isPlaceholder(anonKey)) {
    record(false, 'Supabase — URL et clé anon', 'valeurs absentes de server/.env');
    return;
  }

  let res;
  try {
    res = await fetch(`${url.replace(/\/$/, '')}/auth/v1/health`, {
      headers: { apikey: anonKey },
    });
  } catch (err) {
    record(false, 'Supabase — projet joignable', err.message);
    return;
  }
  record(res.ok, 'Supabase — projet joignable', res.ok ? url : `HTTP ${res.status}`);

  if (isPlaceholder(serviceKey)) {
    record(false, 'Supabase — clé service_role',
      'absente : création, suppression et reset de comptes seront refusés', { warn: true });
    return;
  }
  record(true, 'Supabase — clé service_role renseignée', fingerprint(serviceKey));

  /*
   * Une clé service_role doit pouvoir lister auth.users. Si l'appel échoue, la
   * clé est en réalité une clé anon collée au mauvais endroit — erreur
   * fréquente et silencieuse jusqu'à la première action admin.
   */
  try {
    const probe = await fetch(`${url.replace(/\/$/, '')}/auth/v1/admin/users?page=1&per_page=1`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    record(probe.ok, 'Supabase — service_role réellement privilégiée',
      probe.ok
        ? 'accès admin à auth.users confirmé'
        : `refusé (HTTP ${probe.status}) : ce n'est probablement pas la clé service_role`);
  } catch (err) {
    record(false, 'Supabase — service_role réellement privilégiée', err.message);
  }
}

async function main() {
  const offline = process.argv.includes('--offline');

  console.log(`${C.bold}Vérification des clés d'API${C.reset}`);
  console.log(`${C.dim}Aucune clé n'est affichée en clair.${C.reset}`);
  if (offline) {
    console.log(`${C.dim}Mode hors ligne : contrôles de forme uniquement, aucun appel réseau.${C.reset}`);
  }

  const back = { ...readEnv('server/.env'), ...readEnv('.env') };

  const groqKey = process.env.GROQ_API_KEY || back.GROQ_API_KEY;
  const serpKey = process.env.SERPAPI_KEY || back.SERPAPI_KEY;
  const anonKey = back.SUPABASE_ANON_KEY || back.VITE_SUPABASE_ANON_KEY;
  const serviceKey = back.SUPABASE_SERVICE_ROLE_KEY;

  console.log(`\n${C.bold}${C.cyan}Forme des clés (hors ligne)${C.reset}`);
  checkShape('GROQ_API_KEY', groqKey);
  checkShape('SERPAPI_KEY', serpKey);
  checkSupabaseKeyRole('SUPABASE_ANON_KEY', anonKey, 'anon');
  checkSupabaseKeyRole('SUPABASE_SERVICE_ROLE_KEY', serviceKey, 'service_role');

  if (offline) {
    console.log(
      `\n${C.dim}Pour tester les clés contre les services : npm run verify:keys${C.reset}`
    );
  } else {
    console.log(`\n${C.bold}${C.cyan}Groq (analyse IA)${C.reset}`);
    await checkGroq(groqKey, back.GROQ_MODEL);

    console.log(`\n${C.bold}${C.cyan}SerpAPI (recherche web)${C.reset}`);
    await checkSerpApi(serpKey);

    console.log(`\n${C.bold}${C.cyan}Supabase${C.reset}`);
    await checkSupabase(back.SUPABASE_URL || back.VITE_SUPABASE_URL, anonKey, serviceKey);
  }

  const failed = results.filter((r) => !r.ok && !r.warn);
  const warned = results.filter((r) => !r.ok && r.warn);

  console.log(
    `\n${C.bold}Résultat :${C.reset} ` +
    `${C.green}${results.filter((r) => r.ok).length} réussis${C.reset}, ` +
    `${failed.length ? C.red : C.dim}${failed.length} échecs${C.reset}, ` +
    `${warned.length ? C.yellow : C.dim}${warned.length} avertissements${C.reset}`
  );

  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(`\n${C.red}Erreur inattendue :${C.reset} ${err.message}`);
  process.exit(1);
});
