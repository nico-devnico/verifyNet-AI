// ========================================================
// Script pour créer le compte super administrateur dans Supabase
// ========================================================
// Instructions :
// 1. Installer les dépendances si nécessaire : npm install @supabase/supabase-js
// 2. Configurer les variables d'environnement SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY
// 3. Exécuter : node create-super-admin.js
// ========================================================

const { createClient } = require('@supabase/supabase-js');

// Configuration - REMPLACEZ CES VALEURS PAR LES VÔTRES !
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://lvqvlydzfcuhiyxpadsr.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'VOTRE_CLE_SERVICE_ROLE';

// Paramètres du super admin
const SUPER_ADMIN_EMAIL = 'nicodevnico@gmail.com';
const SUPER_ADMIN_PASSWORD = '@N!co-admin';
const SUPER_ADMIN_USERNAME = 'nico-Admin';

async function createSuperAdmin() {
    console.log('🚀 Création du compte super administrateur VerifyNet...\n');

    try {
        // Initialiser le client Supabase avec le service role (pour bypass RLS)
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        });

        console.log('1️⃣ Vérification si le compte existe déjà...');

        // Vérifier si l'utilisateur existe déjà dans auth.users
        const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
        if (listError) throw listError;

        const existingUser = users.find(u => u.email === SUPER_ADMIN_EMAIL);
        if (existingUser) {
            console.log(`ℹ️ Compte super administrateur déjà existant (ID: ${existingUser.id})`);
            console.log('✅ Terminé !');
            process.exit(0);
        }

        console.log('2️⃣ Création du compte dans auth.users...');

        // Créer l'utilisateur via l'API admin
        const { data: { user }, error: createError } = await supabase.auth.admin.createUser({
            email: SUPER_ADMIN_EMAIL,
            password: SUPER_ADMIN_PASSWORD,
            email_confirm: true,
            user_metadata: {
                username: SUPER_ADMIN_USERNAME,
                role: 'super_admin'
            }
        });

        if (createError) throw createError;

        console.log(`✅ Compte créé avec succès !`);
        console.log(`   ID: ${user.id}`);
        console.log(`   Email: ${user.email}`);
        console.log(`   Username: ${SUPER_ADMIN_USERNAME}`);
        console.log(`   Mot de passe: ${SUPER_ADMIN_PASSWORD}`);
        console.log('');

        // Le trigger handle_new_user va automatiquement créer le profil et les préférences
        console.log('3️⃣ Le profil super admin a été automatiquement créé par le trigger de la base de données !');
        console.log('');
        console.log('🎉 Compte super administrateur prêt à l\'emploi !');
        console.log('');
        console.log('⚠️ IMPORTANT :');
        console.log('   - Changez le mot de passe immédiatement après la première connexion');
        console.log('   - Ce compte est protégé contre toute suppression ou modification de rôle');
        console.log('');

    } catch (error) {
        console.error('❌ Erreur lors de la création du compte :', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

// Vérifier les variables d'environnement
if (!SUPABASE_URL || SUPABASE_URL === 'VOTRE_URL_SUPABASE') {
    console.error('❌ Veuillez configurer SUPABASE_URL');
    process.exit(1);
}
if (!SUPABASE_SERVICE_ROLE_KEY || SUPABASE_SERVICE_ROLE_KEY === 'VOTRE_CLE_SERVICE_ROLE') {
    console.error('❌ Veuillez configurer SUPABASE_SERVICE_ROLE_KEY (clé service role depuis Supabase Dashboard)');
    process.exit(1);
}

createSuperAdmin();