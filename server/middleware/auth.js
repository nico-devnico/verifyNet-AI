/**
 * Authentification et autorisation des appels API.
 *
 * Le JWT est validé auprès de Supabase (jamais décodé à l'aveugle), puis le
 * profil est relu en base pour connaître le rôle réel et l'état de suspension.
 * Un client ne peut donc pas s'annoncer administrateur : le rôle vient
 * toujours de la base.
 */

const { admin, anon, asUser, hasServiceRole } = require('../lib/supabase');

function bearer(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

/**
 * Résout l'utilisateur courant s'il y a un token, sans jamais échouer.
 * Laisse `req.auth = null` pour un visiteur anonyme.
 */
async function attachUser(req, _res, next) {
  req.auth = null;
  const token = bearer(req);
  if (!token || !anon) return next();

  try {
    const { data, error } = await anon.auth.getUser(token);
    if (error || !data?.user) return next();

    const client = admin || asUser(token);
    let profile = null;
    if (client) {
      const { data: row } = await client
        .from('profiles')
        .select('id, email, role, is_suspended, suspension_reason, daily_quota_override')
        .eq('id', data.user.id)
        .maybeSingle();
      profile = row || null;
    }

    req.auth = {
      token,
      user: data.user,
      profile,
      role: profile?.role || 'user',
      isAdmin: ['admin', 'super_admin'].includes(profile?.role),
      isSuperAdmin: profile?.role === 'super_admin',
      isSuspended: Boolean(profile?.is_suspended),
    };
  } catch (err) {
    console.warn('[Auth] Validation du token impossible :', err.message);
  }
  return next();
}

function requireAuth(req, res, next) {
  if (!req.auth) {
    return res.status(401).json({ error: 'Authentification requise.', code: 'UNAUTHENTICATED' });
  }
  if (req.auth.isSuspended) {
    return res.status(403).json({
      error: req.auth.profile?.suspension_reason
        ? `Compte suspendu : ${req.auth.profile.suspension_reason}`
        : 'Votre compte a été suspendu par un administrateur.',
      code: 'ACCOUNT_SUSPENDED',
    });
  }
  return next();
}

function requireSuperAdmin(req, res, next) {
  if (!req.auth) {
    return res.status(401).json({ error: 'Authentification requise.', code: 'UNAUTHENTICATED' });
  }
  if (!req.auth.isSuperAdmin) {
    return res.status(403).json({
      error: 'Privilèges super administrateur requis.',
      code: 'FORBIDDEN',
    });
  }
  return next();
}

/**
 * Garde pour les opérations qui exigent la clé service_role.
 * Renvoie un message actionnable plutôt qu'un plantage opaque.
 */
function requireServiceRole(_req, res, next) {
  if (!hasServiceRole()) {
    return res.status(503).json({
      error:
        "Cette action nécessite la clé service_role Supabase. Renseignez " +
        "SUPABASE_SERVICE_ROLE_KEY dans server/.env puis redémarrez l'API.",
      code: 'SERVICE_ROLE_MISSING',
    });
  }
  return next();
}

module.exports = { attachUser, requireAuth, requireSuperAdmin, requireServiceRole };
