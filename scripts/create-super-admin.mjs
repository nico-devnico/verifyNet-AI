#!/usr/bin/env node
/**
 * Création du premier super administrateur.
 *
 * À n'exécuter qu'une fois, au moment de l'installation : l'interface ne peut
 * pas créer ce compte puisqu'il faut déjà être super admin pour y accéder.
 *
 *   npm run create:super-admin -- --email vous@exemple.com
 *
 * Le mot de passe est demandé à la saisie (masqué) ou lu dans la variable
 * SUPER_ADMIN_PASSWORD. Il n'est jamais écrit dans le dépôt ni dans
 * l'historique du shell si vous utilisez la saisie interactive.
 *
 * Le script effectue trois opérations, dans cet ordre :
 *   1. crée le compte dans auth.users (e-mail déjà confirmé) ;
 *   2. inscrit l'adresse dans system_settings.root_super_admin_email, ce qui
 *      rend le compte intouchable depuis la console ;
 *   3. promeut le profil en super_admin.
 *
 * Rejouer le script sur une adresse existante ne recrée rien : il se contente
 * de reprendre les étapes 2 et 3, ce qui permet de réparer une installation.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { createClient } from '@supabase/supabase-js';

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

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq !== -1) {
      out[arg.slice(2, eq)] = arg.slice(eq + 1);
    } else {
      const next = argv[i + 1];
      out[arg.slice(2)] = next && !next.startsWith('--') ? next : 'true';
      if (next && !next.startsWith('--')) i += 1;
    }
  }
  return out;
}

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((done) => {
    rl.question(question, (answer) => {
      rl.close();
      done(answer.trim());
    });
  });
}

/*
 * Node n'offre pas de saisie masquée : on intercepte l'écho du terminal et on
 * réaffiche des astérisques à la place des caractères tapés.
 */
function askSecret(question) {
  if (!process.stdin.isTTY) return ask(question);

  return new Promise((done) => {
    process.stdout.write(question);
    const { stdin } = process;
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let value = '';
    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') {
          stdin.removeListener('data', onData);
          stdin.setRawMode(Boolean(wasRaw));
          stdin.pause();
          process.stdout.write('\n');
          done(value);
          return;
        }
        if (char === '\u0003') {           // Ctrl+C
          stdin.setRawMode(Boolean(wasRaw));
          process.stdout.write('\n');
          process.exit(130);
        }
        if (char === '\u007f' || char === '\b') {
          if (value.length > 0) {
            value = value.slice(0, -1);
            process.stdout.write('\b \b');
          }
          continue;
        }
        value += char;
        process.stdout.write('*');
      }
    };
    stdin.on('data', onData);
  });
}

function fail(message, hint = '') {
  console.error(`\n${C.red}✗ ${message}${C.reset}`);
  if (hint) console.error(`${C.dim}  ${hint}${C.reset}`);
  process.exit(1);
}

function step(message) {
  console.log(`${C.cyan}→${C.reset} ${message}`);
}

function ok(message) {
  console.log(`${C.green}✓${C.reset} ${message}`);
}

/*
 * Volontairement plus strict que le reste de l'application, qui se contente de
 * 8 caractères : ce compte ne peut être ni suspendu, ni rétrogradé, ni supprimé
 * par qui que ce soit, donc un mot de passe faible ici compromet toute la
 * plateforme sans recours possible depuis l'interface.
 */
function validatePassword(password) {
  if (password.length < 12) return 'au moins 12 caractères';
  if (!/[a-z]/.test(password)) return 'au moins une minuscule';
  if (!/[A-Z]/.test(password)) return 'au moins une majuscule';
  if (!/[0-9]/.test(password)) return 'au moins un chiffre';
  return null;
}

async function main() {
  console.log(`${C.bold}Création du super administrateur VerifyNet${C.reset}\n`);

  const args = parseArgs(process.argv.slice(2));
  const back = readEnv('server/.env');
  const front = readEnv('.env');

  const url =
    process.env.SUPABASE_URL || back.SUPABASE_URL ||
    front.VITE_SUPABASE_URL || back.VITE_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || back.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    fail('URL Supabase introuvable',
      'Renseignez SUPABASE_URL dans server/.env ou VITE_SUPABASE_URL dans .env');
  }
  if (!serviceKey || serviceKey === 'your_service_role_key_here') {
    fail('SUPABASE_SERVICE_ROLE_KEY introuvable',
      'Supabase Dashboard → Project Settings → API → service_role. À placer dans server/.env uniquement.');
  }

  const email = (args.email || process.env.SUPER_ADMIN_EMAIL ||
    await ask('Adresse e-mail du super admin : ')).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(`Adresse invalide : ${email}`);

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  step('Recherche d\'un compte existant…');
  const existing = await findUserByEmail(supabase, email);

  let userId = existing?.id ?? null;

  if (existing) {
    console.log(`${C.yellow}!${C.reset} Compte déjà présent (${existing.id}) — promotion seulement.`);
  } else {
    let password = args.password || process.env.SUPER_ADMIN_PASSWORD || '';
    if (!password) {
      password = await askSecret('Mot de passe (12 caractères minimum) : ');
      const confirmation = await askSecret('Confirmation : ');
      if (password !== confirmation) fail('Les deux saisies diffèrent.');
    }
    const weakness = validatePassword(password);
    if (weakness) fail(`Mot de passe trop faible : il manque ${weakness}.`);

    step('Création du compte dans auth.users…');
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        first_name: args.firstName || 'Super',
        last_name: args.lastName || 'Admin',
        username: args.username || email.split('@')[0],
      },
    });
    if (error) fail(`Création refusée : ${error.message}`);
    userId = data.user.id;
    ok(`Compte créé — ${userId}`);
  }

  /*
   * L'ordre compte : on désigne l'adresse comme racine avant la promotion,
   * pour qu'aucune fenêtre ne laisse un super admin non protégé.
   */
  step('Désignation comme super admin racine (system_settings)…');
  const { error: settingError } = await supabase
    .from('system_settings')
    .update({ value: email, updated_at: new Date().toISOString() })
    .eq('key', 'root_super_admin_email');
  if (settingError) {
    fail(`Réglage impossible : ${settingError.message}`,
      'Le schéma est-il en place ? Exécutez supabase/migrations/0001_core_schema.sql.');
  }
  ok('Adresse racine enregistrée — ce compte ne peut plus être rétrogradé ni supprimé.');

  step('Promotion du profil en super_admin…');
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .update({ role: 'super_admin', is_suspended: false })
    .eq('id', userId)
    .select('id, email, role')
    .maybeSingle();

  if (profileError) fail(`Promotion impossible : ${profileError.message}`);
  if (!profile) {
    fail('Profil introuvable',
      'Le trigger handle_new_user n\'a pas créé la ligne. Exécutez 0001_core_schema.sql puis relancez ce script.');
  }
  ok(`Profil promu — ${profile.email} (${profile.role})`);

  console.log(`\n${C.green}${C.bold}Terminé.${C.reset} Connectez-vous puis ouvrez /superadmin.`);
  console.log(`${C.dim}Pensez à vérifier l'installation : npm run verify:supabase${C.reset}`);
}

/*
 * L'API admin ne filtre pas par e-mail : on pagine jusqu'à trouver la ligne.
 */
async function findUserByEmail(supabase, email) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) fail(`Lecture de auth.users impossible : ${error.message}`);
    const match = data.users.find((u) => u.email?.toLowerCase() === email);
    if (match) return match;
    if (data.users.length < 200) return null;
  }
  return null;
}

main().catch((error) => {
  console.error(`\n${C.red}✗ Erreur inattendue : ${error.message}${C.reset}`);
  process.exit(1);
});
