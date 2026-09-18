/**
 * Application effective des réglages du super admin sur l'API.
 *
 * C'est ici que « mode maintenance », « quota journalier » et les
 * interrupteurs de fonctionnalités cessent d'être de simples lignes en base
 * pour devenir des règles réellement appliquées.
 */

const settings = require('../services/settings');
const { admin, asUser } = require('../lib/supabase');
const visitors = require('../services/visitors');

/** Bloque tout le monde sauf les administrateurs quand la maintenance est active. */
async function maintenanceGate(req, res, next) {
  try {
    if (!(await settings.getBool('maintenance_mode', false))) return next();
    if (req.auth?.isAdmin) return next();

    return res.status(503).json({
      error: await settings.getString(
        'maintenance_message',
        'VerifyNet est en maintenance. Nous revenons très vite.'
      ),
      code: 'MAINTENANCE_MODE',
    });
  } catch {
    return next();
  }
}

/** Refuse une fonctionnalité désactivée par le super admin. */
function featureGate(key, label) {
  return async (_req, res, next) => {
    try {
      if (await settings.getBool(key, true)) return next();
      return res.status(403).json({
        error: `${label} est actuellement désactivée par l'administrateur.`,
        code: 'FEATURE_DISABLED',
      });
    } catch {
      return next();
    }
  };
}

/*
 * Repli mémoire pour le quota anonyme, utilisé uniquement quand la base n'est
 * pas joignable (clé service_role absente, incident Supabase). Le compteur en
 * base est la référence : lui seul survit à un redémarrage et reste cohérent
 * entre plusieurs instances de l'API.
 */
const fallbackUsage = new Map();
let fallbackDay = new Date().toISOString().slice(0, 10);

function rollFallbackDay() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== fallbackDay) {
    fallbackUsage.clear();
    fallbackDay = today;
  }
}

function bumpFallback(key) {
  rollFallbackDay();
  const next = (fallbackUsage.get(key) || 0) + 1;
  fallbackUsage.set(key, next);
  return next;
}

function peekFallback(key) {
  rollFallbackDay();
  return fallbackUsage.get(key) || 0;
}

/** Nombre d'analyses déjà effectuées aujourd'hui par ce visiteur. */
async function countVisitorUsage(visitorHash) {
  if (!admin) return peekFallback(visitorHash);

  const { data, error } = await admin.rpc('visitor_usage_today', {
    p_visitor_hash: visitorHash,
  });

  if (error) {
    console.warn('[Quota] Comptage visiteur impossible, repli mémoire :', error.message);
    return peekFallback(visitorHash);
  }
  return data || 0;
}

/**
 * Quota d'analyses par jour.
 * - Connecté : compte réel des lignes `analyses` du jour, quota individuel
 *   (`daily_quota_override`) prioritaire sur le quota global.
 * - Anonyme : compte des analyses anonymes du jour portant la même empreinte
 *   visiteur, plafonné par `max_anonymous_per_day`.
 * Les administrateurs ne sont jamais limités.
 */
async function quotaGate(req, res, next) {
  try {
    if (req.auth?.isAdmin) return next();

    if (!req.auth) {
      if (!(await settings.getBool('allow_anonymous_analysis', true))) {
        return res.status(401).json({
          error: "L'analyse anonyme est désactivée. Connectez-vous pour continuer.",
          code: 'ANONYMOUS_DISABLED',
        });
      }

      /*
       * L'identité pseudonyme est calculée ici et réutilisée plus loin pour
       * enregistrer l'analyse : elle doit être identique entre le contrôle du
       * quota et l'écriture, sinon le compteur ne retrouverait jamais ses
       * propres lignes.
       */
      req.visitor = visitors.identify(req);

      const limit = await settings.getNumber('max_anonymous_per_day', 5);
      const used = await countVisitorUsage(req.visitor.hash);

      if (used >= limit) {
        return res.status(429).json({
          error: `Limite de ${limit} analyses par jour atteinte pour les visiteurs non connectés. Créez un compte gratuit pour continuer.`,
          code: 'ANONYMOUS_QUOTA_EXCEEDED',
        });
      }

      req.quota = { used, limit, remaining: limit - used };
      // Le repli mémoire n'est incrémenté que s'il sert réellement de référence.
      req.consumeQuota = () => { if (!admin) bumpFallback(req.visitor.hash); };
      return next();
    }

    const client = admin || asUser(req.auth.token);
    if (!client) return next();

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const { count, error } = await client
      .from('analyses')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', req.auth.user.id)
      .gte('created_at', startOfDay.toISOString());

    if (error) {
      console.warn('[Quota] Comptage impossible, requête autorisée :', error.message);
      return next();
    }

    const globalLimit = await settings.getNumber('max_analyses_per_day', 100);
    const limit = req.auth.profile?.daily_quota_override ?? globalLimit;

    if (limit === 0) {
      return res.status(429).json({
        error: "Votre quota d'analyses a été fixé à zéro par un administrateur.",
        code: 'QUOTA_EXCEEDED',
      });
    }

    if ((count || 0) >= limit) {
      return res.status(429).json({
        error: `Quota journalier atteint (${count}/${limit} analyses). Il sera réinitialisé demain.`,
        code: 'QUOTA_EXCEEDED',
      });
    }

    req.quota = { used: count || 0, limit, remaining: limit - (count || 0) };
    return next();
  } catch (err) {
    console.warn('[Quota] Erreur, requête autorisée :', err.message);
    return next();
  }
}

module.exports = { maintenanceGate, featureGate, quotaGate };
