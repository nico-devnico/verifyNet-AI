-- ========================================================
-- VerifyNet - Schéma de base de données Supabase complet
-- ========================================================

-- --------------------------------------------------------
-- 1. Création de l'extension uuid-ossp (pour les UUID)
-- --------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- --------------------------------------------------------
-- 2. Table des profils utilisateurs (liée à auth.users)
-- --------------------------------------------------------
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

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- --------------------------------------------------------
-- 3. Table des analyses sauvegardées
-- --------------------------------------------------------
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

-- Index
CREATE INDEX IF NOT EXISTS idx_analyses_user_id ON public.analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_analyses_created_at ON public.analyses(created_at DESC);

-- --------------------------------------------------------
-- 4. Table des préférences utilisateur
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    theme TEXT DEFAULT 'light' CHECK (theme IN ('light', 'dark')),
    language TEXT DEFAULT 'fr',
    notifications_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- --------------------------------------------------------
-- 5. Table des paramètres du système (pour l'admin)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key TEXT UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Insertion des paramètres par défaut
INSERT INTO public.system_settings (key, value, description) VALUES
    ('app_name', 'VerifyNet', 'Nom de l''application'),
    ('max_analyses_per_day', '100', 'Limite d''analyses par utilisateur et par jour'),
    ('enable_registrations', 'true', 'Autoriser les nouvelles inscriptions'),
    ('maintenance_mode', 'false', 'Mode maintenance activé/désactivé')
ON CONFLICT (key) DO NOTHING;

-- --------------------------------------------------------
-- 6. Table des logs d'activité
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    details JSONB,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Index
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON public.activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON public.activity_logs(created_at DESC);

-- --------------------------------------------------------
-- 7. Fonctions triggers pour updated_at
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- --------------------------------------------------------
-- 8. Triggers pour mettre à jour updated_at automatiquement
-- --------------------------------------------------------
CREATE TRIGGER set_profiles_updated_at 
    BEFORE UPDATE ON public.profiles 
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER set_analyses_updated_at 
    BEFORE UPDATE ON public.analyses 
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER set_user_preferences_updated_at 
    BEFORE UPDATE ON public.user_preferences 
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER set_system_settings_updated_at 
    BEFORE UPDATE ON public.system_settings 
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- --------------------------------------------------------
-- 9. Fonction pour créer automatiquement un profil lors de l'inscription
-- --------------------------------------------------------
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

-- --------------------------------------------------------
-- 10. Trigger pour créer le profil lors de l'inscription
-- --------------------------------------------------------
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created 
    AFTER INSERT ON auth.users 
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- --------------------------------------------------------
-- 11. Politique de sécurité : Profiles
-- --------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Les utilisateurs peuvent voir leur propre profil et les admins tous les profils
CREATE POLICY "Les utilisateurs peuvent voir leur propre profil" 
    ON public.profiles FOR SELECT 
    USING (auth.uid() = id OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- Les utilisateurs peuvent mettre à jour leur propre profil
CREATE POLICY "Les utilisateurs peuvent mettre à jour leur propre profil" 
    ON public.profiles FOR UPDATE 
    USING (auth.uid() = id);

-- Les administrateurs peuvent mettre à jour tous les profils
CREATE POLICY "Les admins peuvent mettre à jour tous les profils" 
    ON public.profiles FOR UPDATE 
    USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- --------------------------------------------------------
-- 12. Politique de sécurité : Analyses
-- --------------------------------------------------------
ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;

-- Les utilisateurs peuvent voir leurs propres analyses
CREATE POLICY "Les utilisateurs peuvent voir leurs propres analyses" 
    ON public.analyses FOR SELECT 
    USING (auth.uid() = user_id OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- Les utilisateurs peuvent insérer leurs propres analyses
CREATE POLICY "Les utilisateurs peuvent insérer leurs propres analyses" 
    ON public.analyses FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

-- Les utilisateurs peuvent supprimer leurs propres analyses
CREATE POLICY "Les utilisateurs peuvent supprimer leurs propres analyses" 
    ON public.analyses FOR DELETE 
    USING (auth.uid() = user_id OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- --------------------------------------------------------
-- 13. Politique de sécurité : User Preferences
-- --------------------------------------------------------
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- Les utilisateurs peuvent voir et modifier leurs propres préférences
CREATE POLICY "Les utilisateurs peuvent accéder à leurs propres préférences" 
    ON public.user_preferences FOR ALL 
    USING (auth.uid() = user_id);

-- --------------------------------------------------------
-- 14. Politique de sécurité : System Settings (admin seulement)
-- --------------------------------------------------------
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Seuls les administrateurs peuvent accéder aux paramètres système
CREATE POLICY "Seuls les admins peuvent accéder aux paramètres système" 
    ON public.system_settings FOR ALL 
    USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- --------------------------------------------------------
-- 15. Politique de sécurité : Activity Logs
-- --------------------------------------------------------
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Les utilisateurs peuvent voir leurs propres logs, les admins tous les logs
CREATE POLICY "Accès aux logs d'activité" 
    ON public.activity_logs FOR SELECT 
    USING (auth.uid() = user_id OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- Tous les utilisateurs authentifiés peuvent insérer des logs
CREATE POLICY "Tout le monde peut insérer des logs" 
    ON public.activity_logs FOR INSERT 
    WITH CHECK (true);

-- ========================================================
-- Fin du schéma
-- ========================================================