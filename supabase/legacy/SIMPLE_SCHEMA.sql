-- ================================================
-- SCHÉMA SIMPLIFIÉ - PAS D'ERREURS !
-- ================================================
-- Exécutez TOUT ce code dans Supabase SQL Editor

-- Étape 1: Supprimer les anciennes tables
DROP TABLE IF EXISTS public.activity_logs CASCADE;
DROP TABLE IF EXISTS public.user_preferences CASCADE;
DROP TABLE IF EXISTS public.analyses CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.system_settings CASCADE;

-- Étape 2: Créer la table des profils (SANS contrainte de clé étrangère !)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'super_admin')),
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  is_verified BOOLEAN DEFAULT false,
  is_suspended BOOLEAN DEFAULT false,
  suspended_at TIMESTAMPTZ,
  suspension_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Étape 3: Désactiver RLS
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;

-- Étape 4: Créer les autres tables
CREATE TABLE public.analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  type TEXT NOT NULL CHECK (type IN ('text', 'url')),
  input TEXT NOT NULL,
  result JSONB,
  score INTEGER,
  verdict TEXT,
  is_removed BOOLEAN DEFAULT false,
  removed_at TIMESTAMPTZ,
  removed_by UUID,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
ALTER TABLE public.analyses DISABLE ROW LEVEL SECURITY;

CREATE TABLE public.system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'general',
  updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_by UUID
);
ALTER TABLE public.system_settings DISABLE ROW LEVEL SECURITY;

CREATE TABLE public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  action TEXT NOT NULL,
  details JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
ALTER TABLE public.activity_logs DISABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE,
  theme TEXT DEFAULT 'dark',
  language TEXT DEFAULT 'fr',
  notifications_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
ALTER TABLE public.user_preferences DISABLE ROW LEVEL SECURITY;

-- Étape 5: Insérer les paramètres système
INSERT INTO public.system_settings (key, value, description, category) VALUES
  ('app_name', 'VerifyNet', 'Nom de l''application', 'general'),
  ('max_analyses_per_day', '100', 'Limite d''analyses par utilisateur et par jour', 'limits'),
  ('enable_registrations', 'true', 'Autoriser les nouvelles inscriptions', 'security'),
  ('maintenance_mode', 'false', 'Mode maintenance activé/désactivé', 'general'),
  ('require_email_verification', 'false', 'Exiger la vérification email pour l''inscription', 'security'),
  ('session_timeout_minutes', '1440', 'Durée de validité des sessions (minutes)', 'security'),
  ('max_upload_size_mb', '10', 'Taille maximale des fichiers uploadés (Mo)', 'limits'),
  ('api_rate_limit_per_minute', '60', 'Limite de requêtes API par minute', 'limits'),
  ('support_email', 'support@verifynet.com', 'Email de support', 'general'),
  ('company_name', 'VerifyNet Inc.', 'Nom de l''entreprise', 'general')
ON CONFLICT (key) DO NOTHING;

-- Étape 6: TRÈS IMPORTANT !
-- Obtenez VOTRE USER ID depuis Supabase → Authentication → Users
-- Copiez votre ID et remplacez 'VOTRE_USER_ID_ICI' ci-dessous,
-- puis exécutez SEULEMENT la requête INSERT ci-dessous :

/*
INSERT INTO public.profiles (id, email, role, is_verified, username, first_name, last_name)
VALUES (
  'VOTRE_USER_ID_ICI',
  'nicodevnico@gmail.com',
  'super_admin',
  true,
  'nicoadmin',
  'Nicolas',
  'Admin'
)
ON CONFLICT (id) DO UPDATE 
SET 
  role = 'super_admin',
  is_verified = true,
  updated_at = TIMEZONE('utc'::text, NOW());
*/

-- Étape 7: Vérifier que ça fonctionne
SELECT '✅ Schéma créé avec succès !' as message;
SELECT * FROM public.system_settings;
