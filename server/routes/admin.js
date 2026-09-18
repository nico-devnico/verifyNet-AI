/**
 * Actions super admin qui touchent à `auth.users`.
 *
 * Tout ce qui peut se faire via RLS ou via une fonction RPC est appelé
 * directement depuis le frontend (voir supabase/migrations/0002_admin_rpc.sql).
 * Ne restent ici que les opérations réservées à l'API Auth Admin, qui exige la
 * clé service_role et ne peut donc jamais être exposée au navigateur :
 * créer un compte, le supprimer définitivement, changer un email, forcer une
 * réinitialisation de mot de passe, révoquer les sessions.
 */

const express = require('express');
const router = express.Router();

const { admin, hasServiceRole, isConfigured } = require('../lib/supabase');
const { requireSuperAdmin, requireServiceRole } = require('../middleware/auth');
const settings = require('../services/settings');

router.use(requireSuperAdmin);

/** Journalise une action privilégiée dans la piste d'audit. */
async function audit(req, action, details = {}, severity = 'critical', targetUserId = null) {
  if (!admin) return;
  try {
    await admin.from('activity_logs').insert({
      user_id: req.auth.user.id,
      target_user_id: targetUserId,
      action,
      details,
      severity,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'] || null,
    });
  } catch (err) {
    console.warn('[Admin] Écriture audit impossible :', err.message);
  }
}

async function isRootAccount(email) {
  if (!email) return false;
  const root = await settings.getString('root_super_admin_email', '');
  return root && email.toLowerCase() === root.toLowerCase();
}

/* -------------------------------------------------------------------------- */
/* Diagnostic                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Vérifie de bout en bout que l'installation est correcte : connexion, schéma
 * appliqué, fonctions RPC présentes, clé service_role disponible.
 */
router.get('/diagnostics', async (req, res) => {
  const checks = [];
  const push = (name, ok, detail) => checks.push({ name, ok, detail });

  push('Configuration Supabase', isConfigured(), isConfigured() ? 'URL et clé anon présentes' : 'SUPABASE_URL ou SUPABASE_ANON_KEY manquant');
  push('Clé service_role', hasServiceRole(), hasServiceRole()
    ? 'Présente — gestion complète des comptes disponible'
    : 'Absente — création/suppression de comptes indisponible');

  const client = admin;
  if (client) {
    for (const table of ['profiles', 'analyses', 'activity_logs', 'system_settings', 'notifications']) {
      try {
        const { error } = await client.from(table).select('*', { count: 'exact', head: true });
        push(`Table ${table}`, !error, error ? error.message : 'Accessible');
      } catch (err) {
        push(`Table ${table}`, false, err.message);
      }
    }

    for (const fn of ['is_admin', 'my_usage_today', 'admin_platform_stats']) {
      try {
        const { error } = await client.rpc(fn, fn === 'admin_platform_stats' ? { p_days: 1 } : {});
        // Un refus d'autorisation prouve que la fonction existe bien
        const missing = error && /does not exist|could not find/i.test(error.message);
        push(`Fonction ${fn}()`, !missing, missing ? 'Introuvable — exécutez 0002_admin_rpc.sql' : 'Présente');
      } catch (err) {
        push(`Fonction ${fn}()`, false, err.message);
      }
    }

    try {
      const { error } = await client.rpc('admin_visitor_stats', { p_days: 1 });
      const missing = error && /does not exist|could not find/i.test(error.message);
      push('Visibilité des visiteurs', !missing,
        missing
          ? 'Introuvable — exécutez 0004_visitor_visibility.sql puis 0005_admin_visibility_fixes.sql'
          : 'Analyses anonymes visibles dans la console');
    } catch (err) {
      push('Visibilité des visiteurs', false, err.message);
    }

    try {
      const { error } = await client.rpc('admin_list_activity_logs', { p_limit: 1, p_offset: 0 });
      const missing = error && /does not exist|could not find/i.test(error.message);
      push('Journal d\'audit', !missing,
        missing
          ? 'Introuvable — exécutez 0005_admin_visibility_fixes.sql'
          : 'Lecture via RPC, indépendante de la relation PostgREST');
    } catch (err) {
      push('Journal d\'audit', false, err.message);
    }

    try {
      const { data, error } = await client.storage.getBucket('analysis-uploads');
      push('Bucket analysis-uploads', Boolean(data) && !error,
        error ? error.message : 'Prêt pour l\'archivage des fichiers');
    } catch (err) {
      push('Bucket analysis-uploads', false, err.message);
    }

    /*
     * La piste d'audit ne doit accepter aucune écriture directe : si une
     * politique d'insertion subsiste, un utilisateur peut fabriquer des
     * entrées et le journal cesse d'être une preuve.
     */
    try {
      const { data, error } = await client.rpc('audit_write_policy_count');
      if (error && /does not exist|could not find/i.test(error.message)) {
        push('Piste d\'audit scellée', false,
          'Vérification indisponible — exécutez 0003_audit_hardening.sql');
      } else if (error) {
        push('Piste d\'audit scellée', false, error.message);
      } else {
        push('Piste d\'audit scellée', data === 0,
          data === 0
            ? 'Écriture réservée aux fonctions SECURITY DEFINER'
            : `${data} politique(s) d'écriture à retirer — exécutez 0003_audit_hardening.sql`);
      }
    } catch (err) {
      push('Piste d\'audit scellée', false, err.message);
    }
  }

  const current = await settings.loadSettings({ force: true });
  res.json({
    ok: checks.every((c) => c.ok),
    checks,
    settings: current,
  });
});

/* -------------------------------------------------------------------------- */
/* Comptes utilisateurs                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Enrichit la liste des profils avec les données d'authentification que
 * `profiles` ne contient pas (dernière connexion, email confirmé, provider).
 */
router.get('/users/auth-info', requireServiceRole, async (_req, res, next) => {
  try {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) throw error;

    res.json({
      users: data.users.map((u) => ({
        id: u.id,
        email: u.email,
        last_sign_in_at: u.last_sign_in_at,
        email_confirmed_at: u.email_confirmed_at,
        created_at: u.created_at,
        providers: u.app_metadata?.providers || [],
        banned_until: u.banned_until || null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/** Création d'un compte par le super admin (avec rôle initial). */
router.post('/users', requireServiceRole, async (req, res, next) => {
  try {
    const { email, password, role = 'user', sendInvite = false } = req.body || {};

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Adresse email invalide.' });
    }
    if (!['user', 'admin', 'super_admin'].includes(role)) {
      return res.status(400).json({ error: 'Rôle invalide.' });
    }
    if (!sendInvite && (!password || password.length < 8)) {
      return res.status(400).json({
        error: 'Le mot de passe doit contenir au moins 8 caractères (ou utilisez une invitation par email).',
      });
    }

    let created;
    if (sendInvite) {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${process.env.CLIENT_URL || 'http://localhost:5173'}/login`,
      });
      if (error) throw error;
      created = data.user;
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error) throw error;
      created = data.user;
    }

    if (role !== 'user') {
      const { error } = await admin.from('profiles').update({ role }).eq('id', created.id);
      if (error) console.warn('[Admin] Rôle initial non appliqué :', error.message);
    }

    await audit(req, 'ADMIN_USER_CREATED', { email, role, invited: sendInvite }, 'critical', created.id);
    res.status(201).json({ user: { id: created.id, email: created.email }, invited: sendInvite });
  } catch (err) {
    next(err);
  }
});

/** Suppression définitive : supprime auth.users, ce qui cascade sur profiles. */
router.delete('/users/:id', requireServiceRole, async (req, res, next) => {
  try {
    const { id } = req.params;

    if (id === req.auth.user.id) {
      return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte.' });
    }

    const { data: profile } = await admin
      .from('profiles').select('email, role').eq('id', id).maybeSingle();

    if (await isRootAccount(profile?.email)) {
      return res.status(403).json({ error: 'Le super administrateur racine ne peut pas être supprimé.' });
    }

    // L'audit est écrit AVANT la suppression : la contrainte ON DELETE SET NULL
    // conserverait une ligne sans identité si on le faisait après.
    await audit(req, 'ADMIN_USER_DELETED', { user_id: id, email: profile?.email, role: profile?.role });

    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw error;

    res.json({ deleted: true, email: profile?.email || null });
  } catch (err) {
    next(err);
  }
});

/** Envoie un lien de réinitialisation de mot de passe. */
router.post('/users/:id/reset-password', requireServiceRole, async (req, res, next) => {
  try {
    const { data: profile } = await admin
      .from('profiles').select('email').eq('id', req.params.id).maybeSingle();

    if (!profile?.email) return res.status(404).json({ error: 'Utilisateur introuvable.' });

    const { error } = await admin.auth.resetPasswordForEmail(profile.email, {
      redirectTo: `${process.env.CLIENT_URL || 'http://localhost:5173'}/login`,
    });
    if (error) throw error;

    await audit(req, 'ADMIN_PASSWORD_RESET_SENT', { email: profile.email }, 'warning', req.params.id);
    res.json({ sent: true, email: profile.email });
  } catch (err) {
    next(err);
  }
});

/** Change l'email d'un compte (auth + profil restent synchronisés par trigger). */
router.patch('/users/:id/email', requireServiceRole, async (req, res, next) => {
  try {
    const { email } = req.body || {};
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Adresse email invalide.' });
    }

    const { data: profile } = await admin
      .from('profiles').select('email').eq('id', req.params.id).maybeSingle();

    if (await isRootAccount(profile?.email)) {
      return res.status(403).json({ error: "L'email du super administrateur racine est verrouillé." });
    }

    const { error } = await admin.auth.admin.updateUserById(req.params.id, {
      email,
      email_confirm: true,
    });
    if (error) throw error;

    await audit(req, 'ADMIN_USER_EMAIL_CHANGED',
      { from: profile?.email, to: email }, 'critical', req.params.id);
    res.json({ updated: true, email });
  } catch (err) {
    next(err);
  }
});

/** Révoque toutes les sessions actives : la suspension prend effet immédiatement. */
router.post('/users/:id/revoke-sessions', requireServiceRole, async (req, res, next) => {
  try {
    const { error } = await admin.auth.admin.signOut(req.params.id, 'global');
    if (error && !/not found/i.test(error.message)) throw error;

    await audit(req, 'ADMIN_SESSIONS_REVOKED', { user_id: req.params.id }, 'warning', req.params.id);
    res.json({ revoked: true });
  } catch (err) {
    next(err);
  }
});

/* -------------------------------------------------------------------------- */
/* Cache des réglages                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Appelé par l'UI après modification d'un paramètre, pour que la nouvelle
 * valeur s'applique à l'API sans attendre l'expiration du cache.
 */
router.post('/settings/refresh', async (_req, res) => {
  settings.invalidate();
  const current = await settings.loadSettings({ force: true });
  res.json({ refreshed: true, settings: current });
});

module.exports = router;
