/**
 * Clients Supabase côté serveur.
 *
 * Deux clients distincts, avec des rôles bien séparés :
 *
 *  - `admin`  : utilise la clé service_role. Il contourne RLS et donne accès à
 *               l'API Auth Admin (créer / supprimer un compte, changer un
 *               email, envoyer un lien de réinitialisation). Cette clé ne doit
 *               JAMAIS quitter le serveur.
 *
 *  - `asUser` : construit un client porteur du JWT de l'appelant. Les requêtes
 *               passent donc par RLS exactement comme depuis le navigateur.
 *               C'est ce client qu'on utilise pour vérifier ce que
 *               l'utilisateur a réellement le droit de faire.
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const hasUrl = Boolean(SUPABASE_URL);
const hasServiceRole = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY);

if (!hasUrl) {
  console.warn('[Supabase] SUPABASE_URL absent : les fonctions liées à la base sont désactivées.');
} else if (!hasServiceRole) {
  console.warn(
    '[Supabase] SUPABASE_SERVICE_ROLE_KEY absent : les actions super admin sur les comptes\n' +
    '           (création, suppression définitive, reset de mot de passe, changement d\'email)\n' +
    '           seront refusées avec un message explicite.'
  );
}

const noPersist = { auth: { autoRefreshToken: false, persistSession: false } };

/** Client service_role — contourne RLS. À n'utiliser qu'après autorisation. */
const admin = hasServiceRole
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, noPersist)
  : null;

/** Client anonyme — sert à valider un JWT et à lire les réglages publics. */
const anon = hasUrl && ANON_KEY
  ? createClient(SUPABASE_URL, ANON_KEY, noPersist)
  : null;

/** Client agissant au nom de l'utilisateur : RLS pleinement appliqué. */
function asUser(accessToken) {
  if (!hasUrl || !ANON_KEY) return null;
  return createClient(SUPABASE_URL, ANON_KEY, {
    ...noPersist,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

module.exports = {
  admin,
  anon,
  asUser,
  hasServiceRole: () => hasServiceRole,
  isConfigured: () => hasUrl && Boolean(ANON_KEY),
};
