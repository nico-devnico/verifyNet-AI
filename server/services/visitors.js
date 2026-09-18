/**
 * Identité pseudonyme d'un visiteur non connecté.
 *
 * Le super admin doit pouvoir observer l'activité des visiteurs — volume,
 * nombre de personnes distinctes, abus éventuels — sans que l'application se
 * transforme en fichier d'adresses IP.
 *
 * Deux valeurs sont dérivées de chaque requête :
 *
 *   • `hash`     HMAC-SHA256 de (IP + agent utilisateur), tronquée à 32
 *                caractères hexadécimaux. Stable dans le temps, donc utilisable
 *                pour compter des visiteurs distincts et appliquer un quota,
 *                mais non réversible : sans le secret, on ne peut pas retrouver
 *                l'IP, et avec le secret il faudrait de toute façon deviner
 *                l'agent utilisateur exact.
 *
 *   • `ipPrefix` IP tronquée à /24 (IPv4) ou /48 (IPv6). Donne l'échelle du
 *                réseau d'origine, suffisante pour identifier un abus groupé,
 *                sans désigner une machine.
 *
 * L'IP brute n'est jamais retournée, et donc jamais stockée.
 */

const crypto = require('node:crypto');

/*
 * Le secret doit rester constant entre les redémarrages, sans quoi un même
 * visiteur compterait comme nouveau chaque jour et le quota anonyme serait
 * réinitialisable à volonté. À défaut de VISITOR_HASH_SECRET, on dérive une
 * valeur de la clé service_role : elle ne quitte pas le serveur et ne change
 * pas. En dernier recours seulement, une valeur aléatoire par processus, avec
 * un avertissement — le comptage devient alors approximatif.
 */
const SECRET = (() => {
  if (process.env.VISITOR_HASH_SECRET) return process.env.VISITOR_HASH_SECRET;

  const derived = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (derived) {
    return crypto.createHash('sha256').update(`verifynet:visitor:${derived}`).digest('hex');
  }

  console.warn(
    '[Visiteurs] Aucun secret stable disponible : les empreintes visiteur changeront\n' +
    '            à chaque redémarrage. Définissez VISITOR_HASH_SECRET dans server/.env\n' +
    '            pour un comptage fiable des visiteurs distincts.'
  );
  return crypto.randomBytes(32).toString('hex');
})();

/** Ramène une adresse au format lisible : Express préfixe l'IPv4 en `::ffff:`. */
function normalizeIp(ip) {
  if (!ip) return '';
  const raw = String(ip).trim();
  const mapped = raw.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  return mapped ? mapped[1] : raw;
}

/**
 * Tronque l'adresse pour ne garder que le réseau.
 * IPv4 : les trois premiers octets (/24). IPv6 : les trois premiers groupes (/48).
 */
function anonymizeIp(ip) {
  const addr = normalizeIp(ip);
  if (!addr) return null;

  if (addr.includes('.')) {
    const parts = addr.split('.');
    if (parts.length !== 4) return null;
    return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  }

  if (addr.includes(':')) {
    const groups = addr.split(':').filter(Boolean);
    if (groups.length === 0) return null;
    return `${groups.slice(0, 3).join(':')}::/48`;
  }

  return null;
}

/**
 * Empreinte pseudonyme du visiteur.
 *
 * L'agent utilisateur entre dans le calcul : derrière une même IP partagée
 * (entreprise, université, opérateur mobile), il permet de distinguer
 * grossièrement plusieurs personnes, ce qui rend le quota moins injuste.
 */
function visitorHash(ip, userAgent) {
  const material = `${normalizeIp(ip)}|${String(userAgent || '').slice(0, 300)}`;
  return crypto.createHmac('sha256', SECRET).update(material).digest('hex').slice(0, 32);
}

/**
 * Identité complète d'une requête anonyme.
 * @returns {{hash: string, ipPrefix: string|null, userAgent: string|null}}
 */
function identify(req) {
  const userAgent = req.get?.('user-agent') || req.headers?.['user-agent'] || null;
  return {
    hash: visitorHash(req.ip, userAgent),
    ipPrefix: anonymizeIp(req.ip),
    userAgent: userAgent ? String(userAgent).slice(0, 500) : null,
  };
}

module.exports = { identify, anonymizeIp, visitorHash, normalizeIp };
