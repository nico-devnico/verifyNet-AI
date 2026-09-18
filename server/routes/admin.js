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

function isAuthNotFound(err) {
  if (!err) return false;
  const status = err.status || err.statusCode;
  const msg = String(err.message || err.error || '');
  return status === 404 || /user not found|unable to find user|not found/i.test(msg);
}

/** Parcourt toutes les pages de l'API Auth Admin (plafond de sécurité : 10 000). */
async function listAllAuthUsers() {
  const users = [];
  const perPage = 200;
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const batch = data?.users || [];
    users.push(...batch);
    if (batch.length < perPage) break;
  }
  return users;
}

/** Agrège le nombre d'analyses par utilisateur (pagination PostgREST 1000). */
async function loadAnalysisCounts() {
  const counts = new Map();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();
  const pageSize = 1000;

  for (let from = 0; from < 50000; from += pageSize) {
    const { data, error } = await admin
      .from('analyses')
      .select('user_id, created_at')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    for (const row of data || []) {
      if (!row.user_id) continue;
      const cur = counts.get(row.user_id) || { total: 0, today: 0 };
      cur.total += 1;
      if (row.created_at && new Date(row.created_at).getTime() >= todayMs) cur.today += 1;
      counts.set(row.user_id, cur);
    }
    if (!data || data.length < pageSize) break;
  }
  return counts;
}

/**
 * Retire le profil même si la cascade Auth → profiles est absente.
 * Les analyses du compte sont supprimées (et non détachées) : la contrainte
 * analyses_visitor_identified interdit un user_id nul sans visitor_hash.
 */
async function deleteProfileRow(id) {
  const { error: analysesError } = await admin.from('analyses').delete().eq('user_id', id);
  if (analysesError) console.warn('[Admin] Analyses non supprimées :', analysesError.message);
  await admin.from('notifications').delete().eq('user_id', id);
  await admin.from('user_preferences').delete().eq('user_id', id);
  const { error } = await admin.from('profiles').delete().eq('id', id);
  if (error && !/no rows|not found|0 rows/i.test(error.message || '')) {
    throw error;
  }
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
      const { data, error } = await client.rpc('admin_account_health');
      const missing = error && /does not exist|could not find/i.test(error.message);
      if (missing) {
        try {
          const authUsers = await listAllAuthUsers();
          const { data: profiles } = await client.from('profiles').select('id');
          const authIds = new Set(authUsers.map((u) => u.id));
          const orphanCount = (profiles || []).filter((p) => !authIds.has(p.id)).length;
          push('Comptes Auth ↔ profils', orphanCount === 0,
            orphanCount === 0
              ? `${authUsers.length} compte(s) Auth — exécutez 0006 pour sceller la cascade`
              : `${orphanCount} profil(s) orphelin(s) — exécutez 0006_admin_account_sync.sql`);
        } catch (fallbackErr) {
          push('Comptes Auth ↔ profils', false,
            'Introuvable — exécutez 0006_admin_account_sync.sql');
        }
      } else if (error) {
        push('Comptes Auth ↔ profils', false, error.message);
      } else {
        const orphans = data?.orphan_profiles || 0;
        const missingProfiles = data?.missing_profiles || 0;
        const mismatches = data?.email_mismatches || 0;
        const ok = orphans === 0 && missingProfiles === 0 && mismatches === 0;
        push('Comptes Auth ↔ profils', ok,
          ok
            ? `${data?.auth_users || 0} compte(s) Auth aligné(s) sur les profils`
            : `${orphans} profil(s) orphelin(s), ${missingProfiles} profil(s) manquant(s), ${mismatches} email(s) désynchronisé(s) — exécutez 0006_admin_account_sync.sql`);
      }
    } catch (err) {
      push('Comptes Auth ↔ profils', false, err.message);
    }

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

function serializeAuthUser(u) {
  return {
    id: u.id,
    email: u.email,
    last_sign_in_at: u.last_sign_in_at,
    email_confirmed_at: u.email_confirmed_at,
    created_at: u.created_at,
    providers: u.app_metadata?.providers || [],
    banned_until: u.banned_until || null,
  };
}

/**
 * Enrichit la liste des profils avec les données d'authentification que
 * `profiles` ne contient pas (dernière connexion, email confirmé, provider).
 * Renvoie aussi les profils orphelins (présents en base, absents d'Auth).
 */
router.get('/users/auth-info', requireServiceRole, async (_req, res, next) => {
  try {
    const [users, profilesRes] = await Promise.all([
      listAllAuthUsers(),
      admin.from('profiles').select('id, email, role, created_at'),
    ]);
    if (profilesRes.error) throw profilesRes.error;

    const authIds = new Set(users.map((u) => u.id));
    const orphans = (profilesRes.data || [])
      .filter((p) => !authIds.has(p.id))
      .map((p) => ({ id: p.id, email: p.email, role: p.role, created_at: p.created_at }));

    res.json({
      users: users.map(serializeAuthUser),
      orphans,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Liste canonique : intersection Auth ∩ profils, email lu depuis Auth.
 * Les profils sans compte Auth sont renvoyés à part (orphans) pour nettoyage.
 */
router.get('/users', requireServiceRole, async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim().toLowerCase();
    const role = String(req.query.role || '').trim();
    const status = String(req.query.status || '').trim();
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 50, 200));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const rootEmail = (await settings.getString('root_super_admin_email', '')).toLowerCase();

    const [authUsers, profilesRes, counts] = await Promise.all([
      listAllAuthUsers(),
      admin.from('profiles').select(
        'id, email, role, username, first_name, last_name, avatar_url, is_verified, is_suspended, suspended_at, suspension_reason, daily_quota_override, last_seen_at, created_at'
      ),
      loadAnalysisCounts(),
    ]);

    if (profilesRes.error) throw profilesRes.error;

    const profileById = new Map((profilesRes.data || []).map((p) => [p.id, p]));
    const authById = new Map(authUsers.map((u) => [u.id, u]));

    const orphans = (profilesRes.data || [])
      .filter((p) => !authById.has(p.id))
      .map((p) => ({ id: p.id, email: p.email, role: p.role, created_at: p.created_at }));

    const items = [];
    for (const u of authUsers) {
      const p = profileById.get(u.id);
      const stats = counts.get(u.id) || { total: 0, today: 0 };
      const email = u.email || p?.email || '';
      const row = {
        id: u.id,
        email,
        role: p?.role || 'user',
        username: p?.username || null,
        first_name: p?.first_name || null,
        last_name: p?.last_name || null,
        avatar_url: p?.avatar_url || null,
        is_verified: p?.is_verified ?? Boolean(u.email_confirmed_at),
        is_suspended: Boolean(p?.is_suspended),
        suspended_at: p?.suspended_at || null,
        suspension_reason: p?.suspension_reason || null,
        daily_quota_override: p?.daily_quota_override ?? null,
        last_seen_at: p?.last_seen_at || u.last_sign_in_at || null,
        created_at: p?.created_at || u.created_at,
        analyses_count: stats.total,
        analyses_today: stats.today,
        is_root: Boolean(rootEmail && email.toLowerCase() === rootEmail),
        has_auth_account: true,
        has_profile: Boolean(p),
      };

      if (search) {
        const blob = [row.email, row.username, row.first_name, row.last_name]
          .filter(Boolean).join(' ').toLowerCase();
        if (!blob.includes(search)) continue;
      }
      if (role && row.role !== role) continue;
      if (status === 'suspended' && !row.is_suspended) continue;
      if (status === 'active' && row.is_suspended) continue;
      items.push(row);
    }

    const rank = (r) => (r.role === 'super_admin' ? 0 : r.role === 'admin' ? 1 : 2);
    items.sort((a, b) => rank(a) - rank(b) || new Date(b.created_at) - new Date(a.created_at));

    res.json({
      items: items.slice(offset, offset + limit),
      total: items.length,
      orphans,
    });
  } catch (err) {
    next(err);
  }
});

/** Supprime les profils sans compte Auth (données de démo, cascades manquées). */
router.post('/users/purge-orphans', requireServiceRole, async (req, res, next) => {
  try {
    const authUsers = await listAllAuthUsers();
    const authIds = new Set(authUsers.map((u) => u.id));
    const { data: profiles, error } = await admin.from('profiles').select('id, email, role');
    if (error) throw error;

    const removed = [];
    for (const p of profiles || []) {
      if (authIds.has(p.id)) continue;
      if (await isRootAccount(p.email)) continue;
      await deleteProfileRow(p.id);
      removed.push({ id: p.id, email: p.email });
    }

    await audit(req, 'ADMIN_ORPHAN_PROFILES_PURGED', {
      deleted: removed.length,
      emails: removed.map((r) => r.email),
    });
    res.json({ deleted: removed.length, emails: removed.map((r) => r.email) });
  } catch (err) {
    next(err);
  }
});

async function ensureProfile(user, role = 'user') {
  const payload = {
    id: user.id,
    email: user.email,
    role,
    is_verified: Boolean(user.email_confirmed_at) || role !== 'user',
  };
  const { data: existing } = await admin.from('profiles').select('id, role').eq('id', user.id).maybeSingle();
  if (!existing) {
    const { error } = await admin.from('profiles').insert(payload);
    if (error) console.warn('[Admin] Profil non créé :', error.message);
    return;
  }
  const patch = { email: user.email };
  if (role !== 'user' && existing.role !== role) patch.role = role;
  const { error } = await admin.from('profiles').update(patch).eq('id', user.id);
  if (error) console.warn('[Admin] Profil non aligné :', error.message);
}

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

    await ensureProfile(created, role);

    await audit(req, 'ADMIN_USER_CREATED', { email, role, invited: sendInvite }, 'critical', created.id);
    res.status(201).json({ user: { id: created.id, email: created.email }, invited: sendInvite });
  } catch (err) {
    next(err);
  }
});

/** Suppression définitive : Auth d'abord, puis le profil s'il reste. */
router.delete('/users/:id', requireServiceRole, async (req, res, next) => {
  try {
    const { id } = req.params;

    if (id === req.auth.user.id) {
      return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte.' });
    }

    const { data: profile } = await admin
      .from('profiles').select('email, role').eq('id', id).maybeSingle();

    let authEmail = profile?.email || null;
    try {
      const { data: authData } = await admin.auth.admin.getUserById(id);
      authEmail = authData?.user?.email || authEmail;
    } catch {
      // Compte déjà absent d'Auth : on continue pour retirer le profil.
    }

    if (await isRootAccount(authEmail) || await isRootAccount(profile?.email)) {
      return res.status(403).json({ error: 'Le super administrateur racine ne peut pas être supprimé.' });
    }

    await audit(req, 'ADMIN_USER_DELETED', {
      user_id: id, email: authEmail, role: profile?.role,
    });

    const { error: authError } = await admin.auth.admin.deleteUser(id);
    if (authError && !isAuthNotFound(authError)) throw authError;

    await deleteProfileRow(id);

    res.json({ deleted: true, email: authEmail });
  } catch (err) {
    next(err);
  }
});

/** Envoie un lien de réinitialisation de mot de passe. */
router.post('/users/:id/reset-password', requireServiceRole, async (req, res, next) => {
  try {
    let email = null;
    try {
      const { data } = await admin.auth.admin.getUserById(req.params.id);
      email = data?.user?.email || null;
    } catch {
      email = null;
    }
    if (!email) {
      const { data: profile } = await admin
        .from('profiles').select('email').eq('id', req.params.id).maybeSingle();
      email = profile?.email || null;
    }

    if (!email) return res.status(404).json({ error: 'Utilisateur introuvable.' });

    const { error } = await admin.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.CLIENT_URL || 'http://localhost:5173'}/login`,
    });
    if (error) throw error;

    await audit(req, 'ADMIN_PASSWORD_RESET_SENT', { email }, 'warning', req.params.id);
    res.json({ sent: true, email });
  } catch (err) {
    next(err);
  }
});

/** Change l'email dans Auth ET dans profiles (le trigger peut manquer). */
router.patch('/users/:id/email', requireServiceRole, async (req, res, next) => {
  try {
    const { id } = req.params;
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Adresse email invalide.' });
    }

    const { data: profile } = await admin
      .from('profiles').select('email').eq('id', id).maybeSingle();

    let currentEmail = profile?.email || null;
    const { data: authLookup } = await admin.auth.admin.getUserById(id);
    const authUser = authLookup?.user || null;
    currentEmail = authUser?.email || currentEmail;

    if (!authUser) {
      return res.status(404).json({
        error: "Ce compte n'existe plus dans Authentification. Supprimez le profil orphelin.",
        code: 'AUTH_USER_MISSING',
      });
    }

    if (await isRootAccount(currentEmail) || await isRootAccount(profile?.email)) {
      return res.status(403).json({ error: "L'email du super administrateur racine est verrouillé." });
    }

    const { data: clash } = await admin
      .from('profiles').select('id, email').ilike('email', email).neq('id', id).maybeSingle();
    if (clash) {
      const { data: clashAuth } = await admin.auth.admin.getUserById(clash.id);
      if (!clashAuth?.user) {
        return res.status(409).json({
          error: 'Cette adresse est déjà utilisée par un profil orphelin. Nettoyez les comptes fantômes, puis réessayez.',
          code: 'ORPHAN_EMAIL_CONFLICT',
        });
      }
      return res.status(409).json({
        error: 'Cette adresse email est déjà utilisée.',
        code: 'EMAIL_TAKEN',
      });
    }

    const { data: updated, error } = await admin.auth.admin.updateUserById(id, {
      email,
      email_confirm: true,
    });
    if (error) throw error;

    const { data: verify } = await admin.auth.admin.getUserById(id);
    const applied = (verify?.user?.email || updated?.user?.email || email).toLowerCase();
    if (applied !== email) {
      console.warn(`[Admin] Auth a conservé ${applied} au lieu de ${email} (confirmation probablement exigée).`);
    }

    const { error: profileError } = await admin
      .from('profiles')
      .update({ email, is_verified: true })
      .eq('id', id);
    if (profileError) {
      console.warn('[Admin] Email Auth mis à jour, profil non synchronisé :', profileError.message);
      throw new Error(
        `L'email Auth a été changé mais le profil n'a pas suivi (${profileError.message}). ` +
        'Exécutez supabase/migrations/0006_admin_account_sync.sql.'
      );
    }

    await audit(req, 'ADMIN_USER_EMAIL_CHANGED',
      { from: currentEmail, to: email }, 'critical', id);
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
