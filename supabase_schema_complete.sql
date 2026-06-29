-- ================================================
-- SCHÉMA COMPLET : SUPER ADMIN + TOUTES LES FONCTIONNALITÉS
-- ================================================

-- 1. Supprimer les anciennes tables (si existantes) pour repartir à zéro
DROP TABLE IF EXISTS public.activity_logs CASCADE;
DROP TABLE IF EXISTS public.user_preferences CASCADE;
DROP TABLE IF EXISTS public.analyses CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.system_settings CASCADE;

-- 2. Créer la table des profils
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

-- 3. Activer RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4. Politiques RLS
CREATE POLICY "Users can view their own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
    ON public.profiles FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    ));

CREATE POLICY "Admins can update profiles"
    ON public.profiles FOR UPDATE
    USING (EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    ));

CREATE POLICY "Service role can do everything"
    ON public.profiles FOR ALL
    USING (true);

-- 5. Fonction trigger pour créer automatiquement le profil
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
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
-- TABLE : ANALYSES
-- ================================================

CREATE TABLE public.analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('text', 'url')),
    input TEXT NOT NULL,
    result JSONB NOT NULL,
    score INTEGER,
    verdict TEXT,
    is_removed BOOLEAN DEFAULT false,
    removed_at TIMESTAMPTZ,
    removed_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own analyses"
    ON public.analyses FOR SELECT
    USING (auth.uid() = user_id OR is_removed = false);

CREATE POLICY "Users can insert their own analyses"
    ON public.analyses FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own analyses"
    ON public.analyses FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own analyses"
    ON public.analyses FOR DELETE
    USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all analyses"
    ON public.analyses FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    ));

CREATE POLICY "Admins can update/remove analyses"
    ON public.analyses FOR UPDATE
    USING (EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    ));

-- ================================================
-- TABLE : ACTIVITY LOGS (JOURNAUX D'ACTIVITÉ)
-- ================================================

CREATE TABLE public.activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    details JSONB,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON public.activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON public.activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON public.activity_logs(action);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own logs"
    ON public.activity_logs FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all logs"
    ON public.activity_logs FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    ));

CREATE POLICY "Everyone can insert logs"
    ON public.activity_logs FOR INSERT
    WITH CHECK (true);

-- ================================================
-- TABLE : SYSTEM SETTINGS (PARAMÈTRES SYSTÈME)
-- ================================================

CREATE TABLE public.system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'general',
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view settings"
    ON public.system_settings FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    ));

CREATE POLICY "Admins can update settings"
    ON public.system_settings FOR ALL
    USING (EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    ));

-- Insertion des paramètres par défaut
INSERT INTO public.system_settings (key, value, description, category) VALUES
    ('app_name', 'VerifyNet', 'Nom de l''application', 'general'),
    ('max_analyses_per_day', '100', 'Limite d''analyses par utilisateur et par jour', 'limits'),
    ('enable_registrations', 'true', 'Autoriser les nouvelles inscriptions', 'security'),
    ('maintenance_mode', 'false', 'Mode maintenance activé/désactivé', 'general'),
    ('require_email_verification', 'false', 'Exiger la vérification email pour l''inscription', 'security'),
    ('session_timeout_minutes', '1440', 'Durée de validité des sessions (minutes)', 'security'),
    ('max_upload_size_mb', '10', 'Taille maximale des fichiers uploadés (Mo)', 'limits'),
    ('api_rate_limit_per_minute', '60', 'Limite de requêtes API par minute', 'limits')
ON CONFLICT (key) DO NOTHING;

-- ================================================
-- TABLE : USER PREFERENCES (PRÉFÉRENCES UTILISATEUR)
-- ================================================

CREATE TABLE public.user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    theme TEXT DEFAULT 'dark' CHECK (theme IN ('light', 'dark')),
    language TEXT DEFAULT 'fr',
    notifications_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own preferences"
    ON public.user_preferences FOR ALL
    USING (auth.uid() = user_id);

-- ================================================
-- FIN DU SCHÉMA
-- ================================================
