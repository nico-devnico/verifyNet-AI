#!/usr/bin/env node
/**
 * Vérification réelle de l'installation Supabase.
 *
 * Le script ne se contente pas de tester la connexion : il crée un compte
 * jetable, s'y connecte, écrit une analyse, tente une escalade de privilèges
 * et vérifie qu'elle échoue, puis supprime tout. C'est le seul moyen de
 * garantir qu'un vrai utilisateur pourra s'inscrire et travailler.
 *
 *   node scripts/verify-supabase.mjs
 *
 * Les clés sont lues dans .env (frontend) et server/.env (service_role).
 * Sans service_role, le compte de test doit être supprimé à la main : le
 * script affiche alors son identifiant.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* -------------------------------------------------------------------------- */
/* Lecture des fichiers .env sans dépendance externe                          */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* Affichage                                                                   */
/* -------------------------------------------------------------------------- */

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', cyan: '\x1b[36m',
};

const results = [];

function record(ok, name, detail = '', { fatal = false, warn = false } = {}) {
  results.push({ ok, name, detail, fatal, warn });
  const mark = ok ? `${C.green}✓${C.reset}` : warn ? `${C.yellow}!${C.reset}` : `${C.red}✗${C.reset}`;
  console.log(`  ${mark} ${name}${detail ? ` ${C.dim}— ${detail}${C.reset}` : ''}`);
  return ok;
}

function section(title) {
  console.log(`\n${C.bold}${C.cyan}${title}${C.reset}`);
}

async function main() {
  console.log(`${C.bold}Vérification de l'installation VerifyNet${C.reset}`);

  const front = { ...readEnv('.env'), ...process.env };
  const back = readEnv('server/.env');

  const url = front.VITE_SUPABASE_URL;
  const anonKey = front.VITE_SUPABASE_ANON_KEY;
  const serviceKey = back.SUPABASE_SERVICE_ROLE_KEY;

  section('1. Configuration');
  if (!record(Boolean(url), 'VITE_SUPABASE_URL défini', url || 'absent de .env', { fatal: true })) {
    return finish();
  }
  if (!record(Boolean(anonKey), 'VITE_SUPABASE_ANON_KEY défini', '', { fatal: true })) {
    return finish();
  }
  const hasService =
    Boolean(serviceKey) && serviceKey !== 'your_service_role_key_here';
  record(
    hasService,
    'SUPABASE_SERVICE_ROLE_KEY défini (server/.env)',
    hasService ? '' : 'les actions super admin sur auth.users seront indisponibles',
    { warn: true }
  );
  record(
    Boolean(back.GROQ_API_KEY) && back.GROQ_API_KEY !== 'your_groq_api_key_here',
    'GROQ_API_KEY défini',
    'sans elle, aucune analyse ne peut aboutir',
    { warn: true }
  );

  const anon = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = hasService
    ? createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;

  /* ------------------------------------------------------------------------ */
  section('2. Schéma');

  for (const table of ['profiles', 'analyses', 'activity_logs', 'notifications', 'system_settings']) {
    const { error } = await anon.from(table).select('*', { head: true, count: 'exact' }).limit(1);
    // 42501 / RLS = table présente mais lecture refusée : c'est un succès de schéma.
    const missing = error && /does not exist|schema cache/i.test(error.message);
    record(!missing, `Table public.${table}`, missing ? 'absente — exécutez 0001_core_schema.sql' : '');
  }

  const { data: settings, error: settingsError } = await anon
    .from('system_settings')
    .select('key, value')
    .eq('is_public', true);

  record(
    !settingsError && (settings?.length ?? 0) > 0,
    'Réglages publics lisibles sans authentification',
    settingsError?.message || `${settings?.length ?? 0} réglage(s)`
  );

  const registrationsOpen =
    settings?.find((s) => s.key === 'enable_registrations')?.value !== 'false';
  const maintenance = settings?.find((s) => s.key === 'maintenance_mode')?.value === 'true';
  if (maintenance) {
    record(true, 'Mode maintenance', 'ACTIF — l’app est fermée aux non-admins', { warn: true });
  }

  /* ------------------------------------------------------------------------ */
  section('3. Fonctions RPC');

  const rpcChecks = [
    ['my_usage_today', {}],
    ['admin_platform_stats', { p_days: 7 }],
    ['admin_list_users', { p_limit: 1 }],
    ['get_shared_analysis', { p_slug: '__inexistant__' }],
  ];

  for (const [fn, params] of rpcChecks) {
    const { error } = await anon.rpc(fn, params);
    const missing = error && /could not find the function|does not exist/i.test(error.message);
    record(!missing, `Fonction ${fn}()`, missing ? 'absente — exécutez 0002_admin_rpc.sql' : '');
  }

  /* ------------------------------------------------------------------------ */
  section('4. Inscription et connexion d’un compte de test');

  if (!registrationsOpen) {
    record(false, 'Inscriptions ouvertes', 'désactivées dans system_settings, test ignoré', { warn: true });
    return finish();
  }

  const stamp = Date.now();
  const email = `verifynet.test.${stamp}@example.com`;
  const password = `Test-${stamp}-Aa!`;

  const { data: signUp, error: signUpError } = await anon.auth.signUp({
    email,
    password,
    options: { data: { first_name: 'Compte', last_name: 'Test' } },
  });

  if (!record(!signUpError, 'Création de compte (auth.signUp)', signUpError?.message || email)) {
    if (/signups not allowed|disabled/i.test(signUpError?.message || '')) {
      console.log(
        `    ${C.dim}Activez Email dans Supabase → Authentication → Providers.${C.reset}`
      );
    }
    return finish();
  }
  const userId = signUp.user?.id ?? null;

  // Sans confirmation d'email, signUp renvoie déjà une session.
  let session = signUp.session;
  if (!session) {
    const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError && /not confirmed/i.test(signInError.message)) {
      record(true, 'Connexion', 'confirmation d’email exigée par le projet', { warn: true });
    } else {
      record(!signInError, 'Connexion (signInWithPassword)', signInError?.message || '');
      session = signIn?.session ?? null;
    }
  } else {
    record(true, 'Session ouverte immédiatement', 'confirmation d’email désactivée');
  }

  if (!session && hasService) {
    // On confirme l'email côté service_role pour pouvoir tester la suite.
    await admin.auth.admin.updateUserById(userId, { email_confirm: true });
    const { data: retry } = await anon.auth.signInWithPassword({ email, password });
    session = retry?.session ?? null;
    record(Boolean(session), 'Connexion après confirmation automatique');
  }

  if (!session) {
    console.log(`\n${C.yellow}Compte de test laissé en place : ${email}${C.reset}`);
    return finish(userId, admin);
  }

  const asUser = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
  });

  /* ------------------------------------------------------------------------ */
  section('5. Profil, RLS et écriture');

  const { data: profile, error: profileError } = await asUser
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  record(
    Boolean(profile),
    'Profil créé automatiquement par le trigger',
    profileError?.message || (profile ? `rôle « ${profile.role} »` : 'aucun profil')
  );
  if (profile) {
    record(profile.role === 'user', 'Rôle initial = user', `obtenu : ${profile.role}`);
    record(
      profile.first_name === 'Compte',
      'Métadonnées d’inscription reportées dans le profil'
    );
  }

  const { data: inserted, error: insertError } = await asUser
    .from('analyses')
    .insert({
      user_id: userId,
      type: 'text',
      input: 'Analyse de vérification automatique',
      score: 72,
      verdict: 'Crédible',
      result: { finalScore: 72, verdict: 'Crédible' },
    })
    .select()
    .single();

  record(!insertError, 'Écriture d’une analyse', insertError?.message || `id ${inserted?.id}`);

  const { data: usage, error: usageError } = await asUser.rpc('my_usage_today');
  record(
    !usageError && usage?.authenticated === true,
    'Quota du jour calculé en base',
    usageError?.message || `${usage?.used}/${usage?.limit}`
  );

  /* --- Les tentatives suivantes DOIVENT échouer --------------------------- */

  const { data: escalated } = await asUser
    .from('profiles')
    .update({ role: 'super_admin' })
    .eq('id', userId)
    .select()
    .maybeSingle();

  record(
    escalated?.role !== 'super_admin',
    'Auto-promotion en super_admin refusée',
    escalated?.role === 'super_admin'
      ? 'FAILLE : le trigger guard_profile_changes est absent'
      : 'le rôle reste « user »'
  );

  const { error: adminRpcError } = await asUser.rpc('admin_set_user_role', {
    p_user_id: userId,
    p_role: 'admin',
  });
  record(
    Boolean(adminRpcError),
    'Appel d’une RPC admin refusé pour un simple utilisateur',
    adminRpcError ? 'erreur renvoyée comme prévu' : 'FAILLE : la fonction a accepté l’appel'
  );

  const { data: others } = await asUser
    .from('analyses')
    .select('id, user_id')
    .neq('user_id', userId);
  record(
    (others?.length ?? 0) === 0,
    'Analyses des autres utilisateurs invisibles',
    others?.length ? `FAILLE : ${others.length} ligne(s) visible(s)` : ''
  );

  const { error: logWriteError } = await asUser
    .from('activity_logs')
    .insert({ user_id: userId, action: 'FAUX_LOG', severity: 'critical' });
  record(
    Boolean(logWriteError),
    'Piste d’audit scellée (écriture directe refusée)',
    logWriteError ? '' : 'exécutez 0003_audit_hardening.sql'
  );

  const { error: writeAuditError } = await asUser.rpc('write_audit', {
    p_action: 'FAUX_AUDIT',
    p_details: {},
    p_target: userId,
    p_severity: 'critical',
  });
  record(
    Boolean(writeAuditError),
    'Fonction write_audit() inaccessible au client',
    writeAuditError ? '' : 'exécutez 0003_audit_hardening.sql'
  );

  /* ------------------------------------------------------------------------ */
  section('6. Nettoyage');

  await asUser.from('analyses').delete().eq('user_id', userId);
  record(true, 'Analyses de test supprimées');

  /*
   * Si les deux tests d'audit ont réussi, rien n'a été écrit. S'ils ont
   * échoué, la base contient maintenant deux fausses entrées : il faut les
   * retirer, sinon le script laisse derrière lui exactement le genre de trace
   * qu'il sert à empêcher.
   */
  const forged = [
    logWriteError ? null : 'FAUX_LOG',
    writeAuditError ? null : 'FAUX_AUDIT',
  ].filter(Boolean);

  if (forged.length === 0) {
    record(true, 'Aucune fausse entrée d’audit à retirer');
  } else if (admin) {
    const { error } = await admin
      .from('activity_logs')
      .delete()
      .eq('user_id', userId)
      .in('action', forged);
    record(!error, 'Fausses entrées d’audit retirées', error?.message || forged.join(', '));
  } else {
    record(
      false,
      'Fausses entrées d’audit à retirer à la main',
      `${forged.join(', ')} — user_id ${userId}`,
      { warn: true }
    );
  }

  return finish(userId, admin);
}

async function finish(userId = null, admin = null) {
  if (userId && admin) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    record(!error, 'Compte de test supprimé', error?.message || '');
  } else if (userId) {
    console.log(
      `  ${C.yellow}!${C.reset} Compte de test à supprimer manuellement ` +
      `${C.dim}(id ${userId})${C.reset}`
    );
  }

  const failed = results.filter((r) => !r.ok && !r.warn);
  const warned = results.filter((r) => !r.ok && r.warn);

  console.log(
    `\n${C.bold}Résultat :${C.reset} ` +
    `${C.green}${results.filter((r) => r.ok).length} réussis${C.reset}, ` +
    `${failed.length ? C.red : C.dim}${failed.length} échecs${C.reset}, ` +
    `${warned.length ? C.yellow : C.dim}${warned.length} avertissements${C.reset}`
  );

  if (failed.length) {
    console.log(`\n${C.red}À corriger :${C.reset}`);
    for (const f of failed) console.log(`  • ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
    console.log(
      `\n${C.dim}La plupart des échecs se règlent en exécutant, dans l'ordre, ` +
      `dans le SQL Editor de Supabase :\n` +
      `  supabase/migrations/0001_core_schema.sql\n` +
      `  supabase/migrations/0002_admin_rpc.sql\n` +
      `  supabase/migrations/0003_audit_hardening.sql\n` +
      `  supabase/migrations/0004_visitor_visibility.sql${C.reset}`
    );
  }

  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(`\n${C.red}Erreur inattendue :${C.reset} ${err.message}`);
  process.exit(1);
});
