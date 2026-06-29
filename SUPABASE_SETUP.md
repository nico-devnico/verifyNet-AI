# Guide Complet de Configuration Supabase

## 🚀 Étape 1 : Créer le Schéma Complet

1. Ouvrez votre projet Supabase → **SQL Editor** → **New Query**
2. Copiez-collez TOUT le contenu du fichier **`supabase_schema_complete.sql`**
3. Cliquez sur **Run**

---

## 🔴 Étape 2 : Créer votre Compte Super Admin

Suivez le guide **`CREATE_SUPER_ADMIN.md`** pour créer votre compte `nicodevnico@gmail.com`.

---

## Problèmes Courants et Solutions

### 🔴 Problème : Boucle de Connexion / Aucun Utilisateur dans Supabase

Cela vient **toujours** de l'une des causes suivantes :

---

## 🚀 Étapes de Configuration à Suivre EXACTEMENT

### Étape 1 : Créer le Schéma dans Supabase

1. Allez dans votre projet Supabase → **SQL Editor**
2. Cliquez sur **New Query**
3. **Supprimez tout le texte** dans l'éditeur
4. Copiez-collez **entièrement** le script ci-dessous et cliquez sur **Run**

```sql
-- ================================================
-- SCHÉMA ULTRA-SIMPLIFIÉ ET ROBUSTE
-- ================================================

-- 1. Supprimer les anciennes tables (si existantes) pour repartir à zéro
DROP TABLE IF EXISTS public.activity_logs CASCADE;
DROP TABLE IF EXISTS public.user_preferences CASCADE;
DROP TABLE IF EXISTS public.analyses CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.system_settings CASCADE;

-- 2. Créer la table des profils (SIMPLIFIÉE)
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'super_admin')),
    username TEXT,
    avatar_url TEXT,
    bio TEXT,
    is_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 3. Activer RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4. Politiques RLS SIMPLES ET SÛRES
CREATE POLICY "Users can view their own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Service role can do everything"
    ON public.profiles FOR ALL
    USING (true);

-- 5. Fonction trigger pour créer automatiquement le profil
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Créer le profil - ULTRA-SIMPLE
    INSERT INTO public.profiles (id, email, role, is_verified)
    VALUES (
        NEW.id,
        NEW.email,
        CASE WHEN NEW.email = 'nicodevnico@gmail.com' THEN 'super_admin' ELSE 'user' END,
        CASE WHEN NEW.email = 'nicodevnico@gmail.com' THEN true ELSE false END
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Créer le trigger sur auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ================================================
-- FIN DU SCHÉMA
-- ================================================
```

---

### Étape 2 : Activer les Fournisseurs d'Authentification

#### A. Email/Mot de Passe

1. Dans Supabase → **Authentication** → **Providers**
2. Cliquez sur **Email**
3. **DÉSACTIVEZ** "Confirm email" (pour tester plus facilement)
4. Cliquez sur **Save**

#### B. Google OAuth

1. Dans Supabase → **Authentication** → **Providers** → **Google**
2. Activez le fournisseur
3. Vous aurez besoin d'un **Client ID** et **Client Secret** depuis Google Cloud Console
   - Allez sur : https://console.cloud.google.com/
   - Créez un projet
   - Activez l'API "Google Identity"
   - Créez des identifiants OAuth 2.0
   - **URI de redirection autorisés** : ajoutez `https://<votre-projet>.supabase.co/auth/v1/callback`
4. Dans Supabase, collez votre Client ID et Client Secret
5. Cliquez sur **Save**

---

### Étape 3 : Configurer les URLs de Redirection

1. Dans Supabase → **Authentication** → **URL Configuration**
2. Dans **Redirect URLs**, ajoutez :
   - `http://localhost:5173`
   - `http://localhost:5173/*`
   - (Et vos URLs de production quand vous déploierez)
3. Cliquez sur **Save**

---

### Étape 4 : Vérifier les Variables d'Environnement

Votre fichier `.env` doit contenir **exactement** ceci :

```env
VITE_SUPABASE_URL=https://lvqvlydzfcuhiyxpadsr.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2cXZseWR6ZmN1aGl5eHBhZHNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1Njg2MTIsImV4cCI6MjA5ODE0NDYxMn0.zPiF1cn_YuJ12lr2bJ6NsXVCBFuqZa1hf1julpe88-s
```

👉 **Important** : Ces valeurs se trouvent dans Supabase → **Project Settings** → **API**

---

## 🧪 Tester Maintenant

1. Ouvrez l'app sur http://localhost:5173
2. Cliquez sur **Créer un compte**
3. Entrez un email (ex: `test@test.com`) et un mot de passe (6+ caractères)
4. Cliquez sur **S'inscrire**
5. Vérifiez dans Supabase → **Authentication** → **Users** : vous DEVEZ voir l'utilisateur !
6. Vérifiez dans Supabase → **Table Editor** → **profiles** : vous DEVEZ voir le profil !

---

## 🔍 Si Ça Ne Marche Toujours Pas

### Vérifiez les Logs dans Supabase

1. Allez dans Supabase → **Logs** → **Postgres**
2. Regardez les erreurs quand vous essayez de vous inscrire

### Vérifiez les Logs dans la Console Navigateur

1. Ouvrez Chrome → F12 → Onglet **Console**
2. Essayez de vous inscrire
3. Regardez les messages en rouge

---

## ✅ Ce que vous DEVEZ Voir dans la Console

```
✅ [Supabase] Configuration chargée
🌐 URL: https://lvqvlydzfcuhiyxpadsr.supabase.co
🔑 Clé publique: eyJhbGci...
🚀 [App] Démarrage de l'initialisation...
🔍 [App] Étape 1: Vérification de la santé Supabase...
✅ [Supabase] Connexion établie avec succès !
📡 [App] Étape 2: Récupération de la session...
✅ [App] Session récupérée: Aucune session
👂 [App] Configuration de l'écouteur onAuthStateChange...
```

Et quand vous vous inscrivez :
```
🔐 [Auth] 2026-06-28T... - Tentative d'inscription email {email: "test@test.com"}
🔐 [Auth] 2026-06-28T... - Appel API signUp
🔐 [Auth] 2026-06-28T... - Inscription réussie {userId: "...", session: true}
```
