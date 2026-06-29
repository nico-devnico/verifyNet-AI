-- ================================================
-- INSÉREZ VOTRE PROFIL SUPER ADMIN APRÈS AVOIR CRÉÉ LE SCHÉMA !
-- ================================================

-- 1. D'ABORD: Ouvrez Supabase → Authentication → Users
-- 2. COPIEZ votre User ID pour nicodevnico@gmail.com
-- 3. REMPLACEZ 'VOTRE_USER_ID_ICI' par votre ID
-- 4. Exécutez cette requête !

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

-- Vérifier
SELECT '✅ Profil Super Admin créé avec succès!' as message;
SELECT * FROM public.profiles;
