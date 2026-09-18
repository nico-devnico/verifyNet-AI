-- ================================================
-- QUICK FIX: Créer vos tables et votre profil SUPER ADMIN
-- ================================================
-- Exécutez TOUT ce code dans Supabase SQL Editor !

-- 1. Créer la table profiles si elle n'existe pas
CREATE TABLE IF NOT EXISTS public.profiles (
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

-- 2. Activer RLS (si pas déjà activé)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. Supprimer les anciennes politiques (si existantes) pour éviter les conflits
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;
DROP POLICY IF EXISTS "Service role can do everything" ON public.profiles;

-- 4. Créer les politiques RLS (SIMPLES ET FONCTIONNELLES !)
CREATE POLICY "Allow all for authenticated users"
  ON public.profiles FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- 5. Créer la fonction trigger
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

-- 6. Supprimer et recréer le trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ================================================
-- 7. CRÉER VOTRE PROFIL SUPER ADMIN MANUELLEMENT !
-- ================================================
-- Remplacez VOTRE_USER_ID par l'ID de votre utilisateur depuis Authentication → Users
-- Exemple: INSERT INTO public.profiles (id, email, role, is_verified) VALUES ('votre-id-ici', 'nicodevnico@gmail.com', 'super_admin', true);
-- ================================================

-- Pour vérifier que ça a fonctionné :
SELECT * FROM public.profiles;
