-- ========================================================
-- VerifyNet - Schéma de base de données Supabase complet (Production Ready + Super Admin)
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
-- 2. Constantes du système
-- ========================================================
-- ID unique et permanent du super-administrateur
CREATE OR REPLACE FUNCTION public.get_super_admin_email()
RETURNS TEXT AS $$
BEGIN
    RETURN 'nicodevnico@gmail.com';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ========================================================
-- 3. Fonction utilitaire pour vérifier le rôle admin
-- ========================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT role INTO user_role 
    FROM public.profiles 
    WHERE id = auth.uid();
    
    RETURN COALESCE(user_role IN ('admin', 'super_admin'), false);
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- ========================================================
-- 4. Fonction pour vérifier si l'utilisateur est super admin
-- ========================================================
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
DECLARE
    user_email TEXT;
BEGIN
    SELECT email INTO user_email 
    FROM public.profiles 
    WHERE id = auth.uid();
    
    RETURN COALESCE(user_email = public.get_super_admin_email(), false);
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- ========================================================
-- 5. Fonction trigger pour updated_at
-- ========================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- ========================================================
-- 6. Fonction trigger pour création profil lors de l'inscription
-- ========================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Déterminer le rôle en fonction de l'email
    DECLARE
        user_role TEXT;
    BEGIN
        IF NEW.email = public.get_super_admin_email() THEN
            user_role := 'super_admin';
        ELSE
            user_role := 'user';
        END IF;

        -- Insérer le profil utilisateur
        INSERT INTO public.profiles (id, email, role, username, is_verified, created_at, updated_at)
        VALUES (
            NEW.id,
            NEW.email,
            user_role,
            CASE WHEN NEW.email = public.get_super_admin_email() THEN 'nico-Admin' ELSE NULL END,
            CASE WHEN NEW.email = public.get_super_admin_email() THEN true ELSE false END,
            TIMEZONE('utc'::text, NOW()),
            TIMEZONE('utc'::text, NOW())
        );

        -- Insérer les préférences par défaut
        INSERT INTO public.user_preferences (user_id, theme, language, created_at, updated_at)
        VALUES (
            NEW.id,
            'dark',
            'fr',
            TIMEZONE('utc'::text, NOW()),
            TIMEZONE('utc'::text, NOW())
        );

        -- Loguer la création
        IF NEW.email = public.get_super_admin_email() THEN
            INSERT INTO public.activity_logs (user_id, action, details, created_at)
            VALUES (
                NEW.id,
                'SUPER_ADMIN_CREATED',
                jsonb_build_object('email', NEW.email, 'username', 'nico-Admin'),
                TIMEZONE('utc'::text, NOW())
            );
        END IF;

        RETURN NEW;
    END;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- ========================================================
-- 7. Trigger pour protéger le super admin (modification/suppression)
-- ========================================================
CREATE OR REPLACE FUNCTION public.protect_super_admin()
RETURNS TRIGGER AS $$
DECLARE
    super_admin_email TEXT;
BEGIN
    super_admin_email := public.get_super_admin_email();

    -- Protection contre la suppression
    IF (TG_OP = 'DELETE') THEN
        IF OLD.email = super_admin_email THEN
            RAISE EXCEPTION 'Impossible de supprimer le compte super administrateur';
        END IF;
        RETURN OLD;
    END IF;

    -- Protection contre la modification
    IF (TG_OP = 'UPDATE') THEN
        IF OLD.email = super_admin_email THEN
            -- Interdire le changement de rôle ou d'email
            IF NEW.role != 'super_admin' OR NEW.email != OLD.email THEN
                RAISE EXCEPTION 'Impossible de modifier le rôle ou l''email du super administrateur';
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    IF (TG_OP = 'INSERT') THEN
        RETURN NEW;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- ========================================================
-- 8. Table des profils utilisateurs
-- ========================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    first_name TEXT,
    last_name TEXT,
    username TEXT,
    avatar_url TEXT,
    bio TEXT,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'super_admin')),
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

-- Trigger pour protéger le super admin
DROP TRIGGER IF EXISTS protect_super_admin_trigger ON public.profiles;
CREATE TRIGGER protect_super_admin_trigger
    BEFORE UPDATE OR DELETE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION protect_super_admin();

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Politiques RLS pour Profiles
CREATE POLICY "Les utilisateurs peuvent voir leur propre profil" 
    ON public.profiles FOR SELECT 
    USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "Les utilisateurs peuvent mettre à jour leur propre profil" 
    ON public.profiles FOR UPDATE 
    USING (auth.uid() = id);

CREATE POLICY "Les admins peuvent mettre à jour tous les profils (sauf super admin)" 
    ON public.profiles FOR UPDATE 
    USING (public.is_admin() AND email != public.get_super_admin_email());

CREATE POLICY "Les super admins peuvent mettre à jour tous les profils" 
    ON public.profiles FOR UPDATE 
    USING (public.is_super_admin());

CREATE POLICY "Les admins peuvent insérer des profils" 
    ON public.profiles FOR INSERT 
    WITH CHECK (public.is_admin());

CREATE POLICY "Les admins peuvent supprimer des profils (sauf super admin)" 
    ON public.profiles FOR DELETE 
    USING (public.is_admin() AND email != public.get_super_admin_email());

CREATE POLICY "Les super admins peuvent supprimer tous les profils" 
    ON public.profiles FOR DELETE 
    USING (public.is_super_admin());

-- ========================================================
-- 9. Table des analyses sauvegardées
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
-- 10. Table des préférences utilisateur
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
-- 11. Table des paramètres du système (pour l'admin)
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
-- 12. Table des logs d'activité
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
-- 13. Trigger sur auth.users pour créer profil automatiquement
-- ========================================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created 
    AFTER INSERT ON auth.users 
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ========================================================
-- 14. Attributions des droits
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