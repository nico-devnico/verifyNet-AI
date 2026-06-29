-- ================================================
-- SCHÉMA COMPLET POUR SUPER ADMIN
-- ================================================
-- Exécutez TOUT ce code dans Supabase SQL Editor

-- Supprimer les anciennes tables
DROP TABLE IF EXISTS public.activity_logs CASCADE;
DROP TABLE IF EXISTS public.user_preferences CASCADE;
DROP TABLE IF EXISTS public.analyses CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.system_settings CASCADE;

-- Créer la table des profils
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
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

-- Désactiver RLS pour éviter les problèmes
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;

-- Créer la table des analyses
CREATE TABLE public.analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('text', 'url')),
  input TEXT NOT NULL,
  result JSONB,
  score INTEGER,
  verdict TEXT,
  is_removed BOOLEAN DEFAULT false,
  removed_at TIMESTAMPTZ,
  removed_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.analyses DISABLE ROW LEVEL SECURITY;

-- Créer la table des paramètres système
CREATE TABLE public.system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'general',
  updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_by UUID REFERENCES public.profiles(id)
);

ALTER TABLE public.system_settings DISABLE ROW LEVEL SECURITY;

-- Créer la table des journaux d'activité
CREATE TABLE public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.activity_logs DISABLE ROW LEVEL SECURITY;

-- Créer la table des préférences utilisateur
CREATE TABLE public.user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  theme TEXT DEFAULT 'dark',
  language TEXT DEFAULT 'fr',
  notifications_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.user_preferences DISABLE ROW LEVEL SECURITY;

-- ================================================
-- INSÉRER LES PARAMÈTRES SYSTÈME
-- ================================================
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

-- ================================================
-- FONCTION TRIGGER POUR NOUVEAUX UTILISATEURS
-- ================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, is_verified)
  VALUES (
    NEW.id,
    NEW.email,
    CASE WHEN NEW.email = 'nicodevnico@gmail.com' THEN 'super_admin' ELSE 'user' END,
    true
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Créer le trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ================================================
-- CRÉER/ACTUALISER VOTRE PROFIL SUPER ADMIN
-- ================================================
-- Remplacez 'VOTRE_USER_ID' par votre ID depuis Authentication → Users
-- Exemple : 'd528133f-f674-48e0-b82d-0c78dd1ce6cb'
INSERT INTO public.profiles (id, email, role, is_verified, username, first_name, last_name)
VALUES (
  'd528133f-f674-48e0-b82d-0c78dd1ce6cb',
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

-- ================================================
-- INSÉRER DES DONNÉES DE DÉMONSTRATION
-- ================================================

-- Ajouter un deuxième utilisateur de test (admin)
INSERT INTO public.profiles (id, email, role, is_verified, username, first_name, last_name)
VALUES (
  gen_random_uuid(),
  'test.admin@exemple.com',
  'admin',
  true,
  'adminuser',
  'Admin',
  'Test'
)
ON CONFLICT DO NOTHING;

-- Ajouter un troisième utilisateur de test (normal)
INSERT INTO public.profiles (id, email, role, is_verified, username, first_name, last_name)
VALUES (
  gen_random_uuid(),
  'test.user@exemple.com',
  'user',
  true,
  'testuser',
  'User',
  'Test'
)
ON CONFLICT DO NOTHING;

-- ================================================
-- AJOUTER DES ANALYSES DE DÉMONSTRATION
-- ================================================
DO $$
DECLARE
  current_user_id UUID;
  user2_id UUID;
  user3_id UUID;
BEGIN
  SELECT id INTO current_user_id FROM public.profiles WHERE email = 'nicodevnico@gmail.com';
  SELECT id INTO user2_id FROM public.profiles WHERE email = 'test.admin@exemple.com';
  SELECT id INTO user3_id FROM public.profiles WHERE email = 'test.user@exemple.com';

  -- Analyse 1 - Super Admin
  INSERT INTO public.analyses (user_id, type, input, score, verdict, result) VALUES
    (current_user_id, 'text', 'Est-ce que le changement climatique est un canular ?', 85, 'Vrai', '{"conclusion": "L''analyse confirme...", "sources": []}'::jsonb);

  -- Analyse 2 - Admin
  IF user2_id IS NOT NULL THEN
    INSERT INTO public.analyses (user_id, type, input, score, verdict, result) VALUES
      (user2_id, 'url', 'https://exemple.com/article-test', 65, 'À vérifier', '{"conclusion": "Article à vérifier...", "sources": []}'::jsonb);
  END IF;

  -- Analyse 3 - User
  IF user3_id IS NOT NULL THEN
    INSERT INTO public.analyses (user_id, type, input, score, verdict, result) VALUES
      (user3_id, 'text', 'Les vaccins contiennent des microchips', 15, 'Faux', '{"conclusion": "Information fausse...", "sources": []}'::jsonb);
  END IF;
END $$;

-- ================================================
-- AJOUTER DES JOURNAUX D'ACTIVITÉ DE DÉMONSTRATION
-- ================================================
DO $$
DECLARE
  current_user_id UUID;
BEGIN
  SELECT id INTO current_user_id FROM public.profiles WHERE email = 'nicodevnico@gmail.com';

  INSERT INTO public.activity_logs (user_id, action, details, user_agent) VALUES
    (current_user_id, 'LOGIN_SUCCESS', '{"method": "password"}'::jsonb, 'Mozilla/5.0 (Windows)'),
    (current_user_id, 'ANALYSIS_CREATED', '{"type": "text", "id": "..."}'::jsonb, 'Mozilla/5.0 (Windows)'),
    (current_user_id, 'PROFILE_UPDATED', '{"field": "username"}'::jsonb, 'Mozilla/5.0 (Windows)'),
    (current_user_id, 'LOGOUT', '{}'::jsonb, 'Mozilla/5.0 (Windows)');
END $$;

-- ================================================
-- VÉRIFIER LES DONNÉES
-- ================================================
SELECT 'Profil créé avec succès!' as message;
SELECT * FROM public.profiles;
SELECT * FROM public.system_settings;
SELECT * FROM public.analyses;
SELECT * FROM public.activity_logs;
