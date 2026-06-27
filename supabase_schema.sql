-- ========================================================
-- VerifyNet - Schéma de base de données Supabase complet (Production Ready)
-- ========================================================

-- ========================================================
-- INITIALISATION ET TRANSACTION
-- ========================================================
BEGIN;

-- ========================================================
-- 1. Extensions nécessaires
-- ========================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========================================================
-- 2. Fonction utilitaire pour vérifier le rôle admin
-- ========================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT role INTO user_role 
    FROM public.profiles 
    WHERE id = auth.uid();
    
    RETURN COALESCE(user_role = 'admin', false);
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- ========================================================
-- 3. Fonction trigger pour updated_at
-- ========================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- ========================================================
-- 4. Fonction trigger pour création profil lors de l'inscription
-- ========================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Insérer le profil utilisateur
    INSERT INTO public.profiles (id, email, role, created_at, updated_at)
    VALUES (
        NEW.id,
        NEW.email,
        'user',
        TIMEZONE('utc'::text, NOW()),
        TIMEZONE('utc'::text, NOW())
    );

    -- Insérer les préférences par défaut
    INSERT INTO public.user_preferences (user_id, theme, language, created_at, updated_at)
    VALUES (
        NEW.id,
        'light',
        'fr',
        TIMEZONE('utc'::text, NOW()),
        TIMEZONE('utc'::text, NOW())
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- ========================================================
-- 5. Table des profils utilisateurs
-- ========================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    first_name TEXT,
    last_name TEXT,
    username TEXT,
    avatar_url TEXT,
    bio TEXT,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    is_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    last_login TIMESTAMP WITH TIME ZONE
);

-- Index pour les performances
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);

-- Trigger pour updated_at
DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at 
    BEFORE UPDATE ON public.profiles 
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Politiques RLS pour Profiles
CREATE POLICY "Les utilisateurs peuvent voir leur propre profil" 
    ON public.profiles FOR SELECT 
    USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "Les utilisateurs peuvent mettre à jour leur propre profil" 
    ON public.profiles FOR UPDATE 
    USING (auth.uid() = id);

CREATE POLICY "Les admins peuvent mettre à jour tous les profils" 
    ON public.profiles FOR UPDATE 
    USING (public.is_admin());

CREATE POLICY "Les admins peuvent insérer des profils" 
    ON public.profiles FOR INSERT 
    WITH CHECK (public.is_admin());

CREATE POLICY "Les admins peuvent supprimer des profils" 
    ON public.profiles FOR DELETE 
    USING (public.is_admin());

-- ========================================================
-- 6. Table des analyses sauvegardées
-- ========================================================
CREATE TABLE IF NOT EXISTS public.analyses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('text', 'url')),
    input TEXT NOT NULL,
    result JSONB NOT NULL,
    score INTEGER,
    verdict TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Index pour les performances
CREATE INDEX IF NOT EXISTS idx_analyses_user_id ON public.analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_analyses_created_at ON public.analyses(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analyses_score ON public.analyses(score);
CREATE INDEX IF NOT EXISTS idx_analyses_type ON public.analyses(type);

-- Trigger pour updated_at
DROP TRIGGER IF EXISTS set_analyses_updated_at ON public.analyses;
CREATE TRIGGER set_analyses_updated_at 
    BEFORE UPDATE ON public.analyses 
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- Enable RLS
ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;

-- Politiques RLS pour Analyses
CREATE POLICY "Les utilisateurs peuvent voir leurs propres analyses" 
    ON public.analyses FOR SELECT 
    USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "Les utilisateurs peuvent insérer leurs propres analyses" 
    ON public.analyses FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Les utilisateurs peuvent mettre à jour leurs propres analyses" 
    ON public.analyses FOR UPDATE 
    USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "Les utilisateurs peuvent supprimer leurs propres analyses" 
    ON public.analyses FOR DELETE 
    USING (auth.uid() = user_id OR public.is_admin());

-- ========================================================
-- 7. Table des préférences utilisateur
-- ========================================================
CREATE TABLE IF NOT EXISTS public.user_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    theme TEXT DEFAULT 'light' CHECK (theme IN ('light', 'dark')),
    language TEXT DEFAULT 'fr',
    notifications_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Trigger pour updated_at
DROP TRIGGER IF EXISTS set_user_preferences_updated_at ON public.user_preferences;
CREATE TRIGGER set_user_preferences_updated_at 
    BEFORE UPDATE ON public.user_preferences 
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- Enable RLS
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- Politiques RLS pour User Preferences
CREATE POLICY "Les utilisateurs peuvent accéder à leurs propres préférences" 
    ON public.user_preferences FOR ALL 
    USING (auth.uid() = user_id);

-- ========================================================
-- 8. Table des paramètres du système (pour l'admin)
-- ========================================================
CREATE TABLE IF NOT EXISTS public.system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key TEXT UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Trigger pour updated_at
DROP TRIGGER IF EXISTS set_system_settings_updated_at ON public.system_settings;
CREATE TRIGGER set_system_settings_updated_at 
    BEFORE UPDATE ON public.system_settings 
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Politiques RLS pour System Settings
CREATE POLICY "Seuls les admins peuvent accéder aux paramètres système" 
    ON public.system_settings FOR ALL 
    USING (public.is_admin());

-- Insertion des paramètres par défaut (ON CONFLICT pour éviter les doublons)
INSERT INTO public.system_settings (key, value, description) VALUES
    ('app_name', 'VerifyNet', 'Nom de l''application'),
    ('max_analyses_per_day', '100', 'Limite d''analyses par utilisateur et par jour'),
    ('enable_registrations', 'true', 'Autoriser les nouvelles inscriptions'),
    ('maintenance_mode', 'false', 'Mode maintenance activé/désactivé')
ON CONFLICT (key) DO NOTHING;

-- ========================================================
-- 9. Table des logs d'activité
-- ========================================================
CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    details JSONB,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Index pour les performances
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON public.activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON public.activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON public.activity_logs(action);

-- Enable RLS
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Politiques RLS pour Activity Logs
CREATE POLICY "Les utilisateurs peuvent voir leurs propres logs" 
    ON public.activity_logs FOR SELECT 
    USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "Tout le monde peut insérer des logs" 
    ON public.activity_logs FOR INSERT 
    WITH CHECK (true);

-- ========================================================
-- 10. Trigger sur auth.users pour créer profil automatiquement
-- ========================================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created 
    AFTER INSERT ON auth.users 
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ========================================================
-- 11. Attributions des droits
-- ========================================================
-- Donner accès au schéma public
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;

-- Donner accès aux tables
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

-- Donner accès aux séquences
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, authenticated, service_role;

-- Donner accès aux fonctions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO postgres, authenticated, service_role;

-- ========================================================
-- COMMIT DE LA TRANSACTION
-- ========================================================
COMMIT;

-- ========================================================
-- FIN DU SCHÉMA
-- ========================================================