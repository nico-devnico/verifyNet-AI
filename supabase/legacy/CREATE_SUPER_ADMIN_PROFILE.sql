-- ================================================
-- SCRIPT ULTRA-SIMPLE : CRÉER LE PROFIL SUPER ADMIN
-- ================================================
-- EXÉCUTEZ CE SCRIPT DANS SUPABASE SQL EDITOR APRÈS AVOIR CRÉÉ L'UTILISATEUR

-- 1. D'abord, vérifiez que l'utilisateur existe dans auth.users
--    (Vous devez d'abord créer l'utilisateur dans Supabase → Authentication → Users)

-- 2. Crée ou met à jour le profil super admin
INSERT INTO public.profiles (id, email, role, username, is_verified, created_at, updated_at)
SELECT 
    id,
    email,
    'super_admin' AS role,
    'nico-Admin' AS username,
    true AS is_verified,
    NOW() AS created_at,
    NOW() AS updated_at
FROM auth.users
WHERE email = 'nicodevnico@gmail.com'
ON CONFLICT (id) DO UPDATE
SET 
    role = EXCLUDED.role,
    username = EXCLUDED.username,
    is_verified = EXCLUDED.is_verified,
    updated_at = NOW();

-- 3. Vérifiez que ça a fonctionné
SELECT * FROM public.profiles WHERE email = 'nicodevnico@gmail.com';

-- ================================================
-- C'EST FINI !
-- ================================================
