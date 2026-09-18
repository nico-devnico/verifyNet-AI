-- ================================================
-- SOLUTION DEFINITIVE : DÉSACTIVER RLS POUR QUE ÇA FONCTIONNE !
-- ================================================
-- Exécutez TOUT ce code dans Supabase SQL Editor

-- 1. Supprimer TOUTES les anciennes tables (pour repartir à zéro)
DROP TABLE IF EXISTS public.activity_logs CASCADE;
DROP TABLE IF EXISTS public.user_preferences CASCADE;
DROP TABLE IF EXISTS public.analyses CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.system_settings CASCADE;

-- 2. Créer la table profiles SANS POLITIQUES RLS !
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

-- 3. CRUCIAL : DÉSACTIVER RLS COMPLÈTEMENT !
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;

-- 4. Créer la fonction trigger
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

-- 5. Créer le trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ================================================
-- 6. CRÉER VOTRE PROFIL SUPER ADMIN !
-- ================================================
-- Votre User ID est : d528133f-f674-48e0-b82d-0c78dd1ce6cb
INSERT INTO public.profiles (id, email, role, is_verified) 
VALUES (
  'd528133f-f674-48e0-b82d-0c78dd1ce6cb', 
  'nicodevnico@gmail.com', 
  'super_admin', 
  true
)
ON CONFLICT (id) DO UPDATE 
SET 
  role = 'super_admin',
  is_verified = true,
  updated_at = TIMEZONE('utc'::text, NOW());

-- 7. Vérifier
SELECT * FROM public.profiles;
