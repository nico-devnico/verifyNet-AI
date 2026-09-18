-- ============================================================================
-- VerifyNet — 0001_core_schema.sql
-- ----------------------------------------------------------------------------
-- Migration ADDITIVE et IDEMPOTENTE : aucun DROP TABLE, aucune perte de
-- données. Peut être exécutée plusieurs fois sans effet de bord.
--
-- Corrige trois problèmes critiques du schéma précédent :
--   1. Récursion infinie RLS (erreur 42P17) : les politiques sur `profiles`
--      interrogeaient `profiles` dans leur propre clause USING. Remplacé par
--      des fonctions SECURITY DEFINER qui contournent RLS.
--   2. Faille majeure : la politique `FOR ALL USING (true)` rendait la table
--      `profiles` lisible ET modifiable par n'importe quel visiteur anonyme
--      (les politiques RLS se combinent avec OR). Supprimée.
--   3. Escalade de privilèges : un utilisateur pouvait se promouvoir
--      super_admin via un simple UPDATE. Bloqué par trigger.
--
-- À exécuter dans : Supabase Dashboard → SQL Editor → New query
-- ============================================================================

set search_path = public;

-- ============================================================================
-- SECTION 1 — TABLES
-- ============================================================================

create table if not exists public.profiles (
    id          uuid primary key references auth.users(id) on delete cascade,
    email       text unique not null,
    role        text not null default 'user',
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

-- Colonnes ajoutées de façon incrémentale (compatibles bases existantes)
alter table public.profiles add column if not exists username             text;
alter table public.profiles add column if not exists first_name           text;
alter table public.profiles add column if not exists last_name            text;
alter table public.profiles add column if not exists avatar_url           text;
alter table public.profiles add column if not exists bio                  text;
alter table public.profiles add column if not exists is_verified          boolean not null default false;
alter table public.profiles add column if not exists is_suspended         boolean not null default false;
alter table public.profiles add column if not exists suspended_at         timestamptz;
alter table public.profiles add column if not exists suspension_reason    text;
alter table public.profiles add column if not exists last_seen_at         timestamptz;
alter table public.profiles add column if not exists daily_quota_override integer;
alter table public.profiles add column if not exists admin_notes          text;

-- Contrainte de rôle (recréée pour rester alignée)
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
    add constraint profiles_role_check
    check (role in ('user', 'admin', 'super_admin'));

create index if not exists idx_profiles_role       on public.profiles(role);
create index if not exists idx_profiles_created_at on public.profiles(created_at desc);
create index if not exists idx_profiles_suspended  on public.profiles(is_suspended) where is_suspended;

-- ----------------------------------------------------------------------------
-- analyses
-- ----------------------------------------------------------------------------
create table if not exists public.analyses (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid references public.profiles(id) on delete cascade,
    type       text not null,
    input      text not null,
    result     jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.analyses add column if not exists score                 integer;
alter table public.analyses add column if not exists verdict               text;
alter table public.analyses add column if not exists is_removed            boolean not null default false;
alter table public.analyses add column if not exists removed_at            timestamptz;
alter table public.analyses add column if not exists removed_by            uuid references public.profiles(id) on delete set null;
alter table public.analyses add column if not exists removal_reason        text;

-- Support image / document : texte extrait et métadonnées du fichier source
alter table public.analyses add column if not exists extracted_text        text;
alter table public.analyses add column if not exists extraction_method     text;
alter table public.analyses add column if not exists extraction_confidence numeric(5,2);
alter table public.analyses add column if not exists file_name             text;
alter table public.analyses add column if not exists file_mime             text;
alter table public.analyses add column if not exists file_size             bigint;
alter table public.analyses add column if not exists page_count            integer;
alter table public.analyses add column if not exists storage_path          text;

-- Partage public d'un rapport via lien
alter table public.analyses add column if not exists is_public             boolean not null default false;
alter table public.analyses add column if not exists share_slug            text;

create unique index if not exists idx_analyses_share_slug
    on public.analyses(share_slug) where share_slug is not null;

alter table public.analyses drop constraint if exists analyses_type_check;
alter table public.analyses
    add constraint analyses_type_check
    check (type in ('text', 'url', 'image', 'document'));

alter table public.analyses drop constraint if exists analyses_extraction_method_check;
alter table public.analyses
    add constraint analyses_extraction_method_check
    check (extraction_method is null or extraction_method in
           ('ocr', 'pdf-text', 'pdf-ocr', 'docx', 'plain-text', 'manual'));

create index if not exists idx_analyses_user_id    on public.analyses(user_id);
create index if not exists idx_analyses_created_at on public.analyses(created_at desc);
create index if not exists idx_analyses_type       on public.analyses(type);
create index if not exists idx_analyses_removed    on public.analyses(is_removed) where is_removed;

-- ----------------------------------------------------------------------------
-- activity_logs — piste d'audit
-- ----------------------------------------------------------------------------
create table if not exists public.activity_logs (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid references public.profiles(id) on delete set null,
    action     text not null,
    details    jsonb,
    ip_address text,
    user_agent text,
    created_at timestamptz not null default now()
);

alter table public.activity_logs add column if not exists target_user_id uuid
    references public.profiles(id) on delete set null;
alter table public.activity_logs add column if not exists severity text not null default 'info';

alter table public.activity_logs drop constraint if exists activity_logs_severity_check;
alter table public.activity_logs
    add constraint activity_logs_severity_check
    check (severity in ('info', 'warning', 'critical'));

create index if not exists idx_activity_logs_user_id    on public.activity_logs(user_id);
create index if not exists idx_activity_logs_created_at on public.activity_logs(created_at desc);
create index if not exists idx_activity_logs_action     on public.activity_logs(action);
create index if not exists idx_activity_logs_severity   on public.activity_logs(severity);

-- ----------------------------------------------------------------------------
-- system_settings — paramètres pilotés par le super admin
-- ----------------------------------------------------------------------------
create table if not exists public.system_settings (
    id          uuid primary key default gen_random_uuid(),
    key         text unique not null,
    value       text not null,
    description text,
    category    text not null default 'general',
    updated_at  timestamptz not null default now(),
    updated_by  uuid references public.profiles(id) on delete set null
);

-- `value_type` pilote le widget affiché dans l'UI super admin.
-- `is_public` autorise la lecture anonyme : indispensable pour que la page
-- d'inscription et le mode maintenance s'appliquent AVANT authentification.
alter table public.system_settings add column if not exists value_type text not null default 'string';
alter table public.system_settings add column if not exists is_public  boolean not null default false;

alter table public.system_settings drop constraint if exists system_settings_value_type_check;
alter table public.system_settings
    add constraint system_settings_value_type_check
    check (value_type in ('string', 'boolean', 'number', 'text'));

-- ----------------------------------------------------------------------------
-- user_preferences
-- ----------------------------------------------------------------------------
create table if not exists public.user_preferences (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid unique references public.profiles(id) on delete cascade,
    theme      text default 'dark',
    language   text default 'fr',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.user_preferences add column if not exists notifications_enabled boolean not null default true;
alter table public.user_preferences add column if not exists email_digest          boolean not null default false;

alter table public.user_preferences drop constraint if exists user_preferences_theme_check;
alter table public.user_preferences
    add constraint user_preferences_theme_check
    check (theme in ('light', 'dark', 'system'));

-- ----------------------------------------------------------------------------
-- notifications — permet au super admin de diffuser un message dans l'app
-- ----------------------------------------------------------------------------
create table if not exists public.notifications (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid not null references public.profiles(id) on delete cascade,
    title      text not null,
    body       text,
    level      text not null default 'info',
    is_read    boolean not null default false,
    read_at    timestamptz,
    created_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now()
);

alter table public.notifications drop constraint if exists notifications_level_check;
alter table public.notifications
    add constraint notifications_level_check
    check (level in ('info', 'success', 'warning', 'critical'));

create index if not exists idx_notifications_user_unread
    on public.notifications(user_id, is_read, created_at desc);

-- ============================================================================
-- SECTION 2 — FONCTIONS DE RÔLE (anti-récursion)
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER => exécutées avec les droits du propriétaire, donc elles
-- contournent RLS. C'est ce qui casse la récursion : une politique sur
-- `profiles` peut appeler ces fonctions sans se rappeler elle-même.
-- ============================================================================

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select coalesce((select p.role from public.profiles p where p.id = auth.uid()), 'anon');
$$;

comment on function public.current_user_role() is
    'Rôle de l''appelant. SECURITY DEFINER pour contourner RLS et éviter la récursion 42P17.';

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select public.current_user_role() in ('admin', 'super_admin');
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select public.current_user_role() = 'super_admin';
$$;

-- Compte suspendu ? Utilisé pour bloquer toute écriture d'un utilisateur banni.
create or replace function public.is_suspended()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select coalesce((select p.is_suspended from public.profiles p where p.id = auth.uid()), false);
$$;

/*
 * Email du super admin racine, stocké en base.
 *
 * Le repli est la chaîne vide, jamais une adresse en dur : `handle_new_user`
 * promeut automatiquement le compte dont l'email correspond à cette valeur, si
 * bien qu'une adresse codée ici serait une porte dérobée — il suffirait de
 * s'inscrire avec elle pour obtenir un rôle super_admin intouchable. Aucune
 * adresse réelle n'étant égale à '', la comparaison échoue simplement tant que
 * le réglage n'a pas été renseigné (voir `npm run create:super-admin`).
 */
create or replace function public.root_super_admin_email()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select coalesce(
        nullif(trim((select s.value from public.system_settings s
                      where s.key = 'root_super_admin_email')), ''),
        ''
    );
$$;

create or replace function public.setting(p_key text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select s.value from public.system_settings s where s.key = p_key;
$$;

create or replace function public.setting_bool(p_key text, p_default boolean default false)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select coalesce(lower(public.setting(p_key)) in ('true', 't', '1', 'yes', 'on'), p_default);
$$;

grant execute on function public.current_user_role()      to anon, authenticated;
grant execute on function public.is_admin()               to anon, authenticated;
grant execute on function public.is_super_admin()         to anon, authenticated;
grant execute on function public.is_suspended()           to anon, authenticated;
grant execute on function public.root_super_admin_email() to anon, authenticated;
grant execute on function public.setting(text)            to authenticated;
grant execute on function public.setting_bool(text, boolean) to authenticated;

-- ============================================================================
-- SECTION 3 — PARAMÈTRES PAR DÉFAUT
-- ----------------------------------------------------------------------------
-- ON CONFLICT DO NOTHING sur `value` : on ne réécrase jamais un réglage déjà
-- personnalisé par le super admin. Seuls les libellés sont rafraîchis.
-- ============================================================================

insert into public.system_settings (key, value, description, category, value_type, is_public) values
    ('app_name',                  'VerifyNet', 'Nom public de l''application',                                  'general', 'string',  true),
    ('app_tagline',               'Vérifiez l''information avant de la partager', 'Slogan affiché sur l''accueil', 'general', 'string',  true),
    ('maintenance_mode',          'false',     'Mode maintenance : seuls les admins peuvent utiliser l''app',   'general', 'boolean', true),
    ('maintenance_message',       'VerifyNet est en maintenance. Nous revenons très vite.', 'Message affiché pendant la maintenance', 'general', 'text', true),
    ('enable_registrations',      'true',      'Autoriser la création de nouveaux comptes',                     'security', 'boolean', true),
    ('allow_anonymous_analysis',  'true',      'Autoriser l''analyse sans être connecté',                       'security', 'boolean', true),
    ('require_email_verification','false',     'Exiger la vérification de l''email avant utilisation',          'security', 'boolean', true),
    -- Volontairement vide : renseigné par `npm run create:super-admin`. Une
    -- adresse par défaut permettrait à quiconque connaît ce dépôt de s'inscrire
    -- avec elle pour devenir super admin racine.
    ('root_super_admin_email',    '',          'Compte super admin racine, non rétrogradable',                  'security', 'string',  false),
    ('max_analyses_per_day',      '100',       'Analyses maximum par utilisateur et par jour',                  'limits',   'number',  true),
    ('max_anonymous_per_day',     '5',         'Analyses maximum par visiteur non connecté et par jour',        'limits',   'number',  true),
    ('max_upload_size_mb',        '15',        'Taille maximale d''un fichier importé (Mo)',                    'limits',   'number',  true),
    ('max_text_length',           '20000',     'Longueur maximale du texte analysé (caractères)',               'limits',   'number',  true),
    ('enable_image_analysis',     'true',      'Activer l''analyse d''images (OCR)',                            'features', 'boolean', true),
    ('enable_document_analysis',  'true',      'Activer l''analyse de documents (PDF, DOCX, TXT)',              'features', 'boolean', true),
    ('enable_public_sharing',     'true',      'Autoriser le partage public des rapports par lien',             'features', 'boolean', true),
    ('enable_pdf_export',         'true',      'Autoriser l''export PDF des rapports',                          'features', 'boolean', true),
    -- L'extraction du texte se fait entièrement dans le navigateur : archiver
    -- le fichier d'origine est un choix de conservation, pas une nécessité
    -- technique. Désactivez-le pour ne stocker que le texte extrait.
    ('enable_file_archiving',     'true',      'Conserver le fichier d''origine dans le stockage privé',        'features', 'boolean', true)
on conflict (key) do update set
    description = excluded.description,
    category    = excluded.category,
    value_type  = excluded.value_type,
    is_public   = excluded.is_public;

-- ============================================================================
-- SECTION 4 — TRIGGERS
-- ============================================================================

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

do $$
declare
    t text;
begin
    foreach t in array array['profiles', 'analyses', 'user_preferences', 'system_settings']
    loop
        execute format('drop trigger if exists trg_touch_updated_at on public.%I', t);
        execute format(
            'create trigger trg_touch_updated_at before update on public.%I
             for each row execute function public.touch_updated_at()', t);
    end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- Création automatique du profil à l'inscription.
-- Applique aussi `enable_registrations` au niveau base : c'est la seule
-- protection qui ne peut pas être contournée en appelant l'API directement.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_root_email     text := public.root_super_admin_email();
    v_is_root        boolean;
    v_registrations  boolean;
    v_role           text;
begin
    v_is_root := (lower(new.email) = lower(v_root_email));

    select coalesce(lower(value) in ('true','t','1','yes','on'), true)
      into v_registrations
      from public.system_settings
     where key = 'enable_registrations';

    if not coalesce(v_registrations, true) and not v_is_root then
        raise exception 'INSCRIPTIONS_DESACTIVEES'
            using hint = 'Les inscriptions sont temporairement fermées par l''administrateur.';
    end if;

    v_role := case when v_is_root then 'super_admin' else 'user' end;

    insert into public.profiles (id, email, role, is_verified, first_name, last_name, avatar_url, username)
    values (
        new.id,
        new.email,
        v_role,
        v_is_root or (new.email_confirmed_at is not null),
        nullif(new.raw_user_meta_data ->> 'first_name', ''),
        nullif(new.raw_user_meta_data ->> 'last_name', ''),
        coalesce(
            nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
            nullif(new.raw_user_meta_data ->> 'picture', '')
        ),
        coalesce(
            nullif(new.raw_user_meta_data ->> 'username', ''),
            nullif(new.raw_user_meta_data ->> 'full_name', ''),
            nullif(new.raw_user_meta_data ->> 'name', '')
        )
    )
    on conflict (id) do update set
        email      = excluded.email,
        -- On ne rétrograde jamais un rôle existant lors d'une reconnexion OAuth
        role       = case when profiles.role = 'user' then excluded.role
                          else profiles.role end,
        avatar_url = coalesce(profiles.avatar_url, excluded.avatar_url);

    insert into public.user_preferences (user_id) values (new.id)
    on conflict (user_id) do nothing;

    insert into public.activity_logs (user_id, action, details, severity)
    values (new.id, 'ACCOUNT_CREATED',
            jsonb_build_object('email', new.email, 'role', v_role), 'info');

    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- Garde l'email du profil synchronisé si l'utilisateur le change via Supabase Auth
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if new.email is distinct from old.email then
        update public.profiles set email = new.email where id = new.id;
    end if;
    if new.email_confirmed_at is not null and old.email_confirmed_at is null then
        update public.profiles set is_verified = true where id = new.id;
    end if;
    return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
    after update on auth.users
    for each row execute function public.handle_user_email_change();

-- ----------------------------------------------------------------------------
-- Anti-escalade de privilèges.
-- RLS ne sait pas restreindre des COLONNES : sans ce trigger, un utilisateur
-- autorisé à modifier son profil pourrait exécuter
--     update profiles set role = 'super_admin' where id = auth.uid();
-- Le trigger réécrit silencieusement les champs sensibles à leur valeur
-- précédente quand l'appelant n'est pas admin, et protège le super admin
-- racine contre toute rétrogradation ou suspension.
-- ----------------------------------------------------------------------------
create or replace function public.guard_profile_changes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_is_privileged boolean;
begin
    -- Les appels serveur (service_role) et les migrations gardent tous les droits
    v_is_privileged := coalesce(auth.uid() is null, true) or public.is_admin();

    if not v_is_privileged then
        new.role                 := old.role;
        new.is_verified          := old.is_verified;
        new.is_suspended         := old.is_suspended;
        new.suspended_at         := old.suspended_at;
        new.suspension_reason    := old.suspension_reason;
        new.daily_quota_override := old.daily_quota_override;
        new.admin_notes          := old.admin_notes;
        new.email                := old.email;
    end if;

    -- Seul un super admin peut fabriquer un autre super admin
    if new.role = 'super_admin' and old.role <> 'super_admin'
       and auth.uid() is not null and not public.is_super_admin() then
        raise exception 'Seul un super administrateur peut accorder le rôle super_admin.';
    end if;

    -- Le super admin racine est intouchable
    if lower(old.email) = lower(public.root_super_admin_email()) then
        new.role         := 'super_admin';
        new.is_suspended := false;
    end if;

    return new;
end;
$$;

drop trigger if exists trg_guard_profile_changes on public.profiles;
create trigger trg_guard_profile_changes
    before update on public.profiles
    for each row execute function public.guard_profile_changes();

-- Empêche un utilisateur de s'auto-attribuer un rôle dès l'INSERT
create or replace function public.guard_profile_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if auth.uid() is not null and not public.is_super_admin() then
        if lower(new.email) = lower(public.root_super_admin_email()) then
            new.role := 'super_admin';
        else
            new.role := 'user';
        end if;
        new.is_suspended := false;
    end if;
    return new;
end;
$$;

drop trigger if exists trg_guard_profile_insert on public.profiles;
create trigger trg_guard_profile_insert
    before insert on public.profiles
    for each row execute function public.guard_profile_insert();

-- ============================================================================
-- SECTION 5 — ROW LEVEL SECURITY
-- ============================================================================

alter table public.profiles         enable row level security;
alter table public.analyses         enable row level security;
alter table public.activity_logs    enable row level security;
alter table public.system_settings  enable row level security;
alter table public.user_preferences enable row level security;
alter table public.notifications    enable row level security;

-- Purge de TOUTES les anciennes politiques (dont la faille USING(true))
do $$
declare
    r record;
begin
    for r in
        select schemaname, tablename, policyname
          from pg_policies
         where schemaname = 'public'
           and tablename in ('profiles','analyses','activity_logs',
                             'system_settings','user_preferences','notifications')
    loop
        execute format('drop policy if exists %I on %I.%I',
                       r.policyname, r.schemaname, r.tablename);
    end loop;
end;
$$;

-- ---------------------------------------------------------------- profiles --
create policy "profiles_select_own_or_admin" on public.profiles
    for select using (auth.uid() = id or public.is_admin());

create policy "profiles_insert_self" on public.profiles
    for insert with check (auth.uid() = id);

create policy "profiles_update_own_or_admin" on public.profiles
    for update using (auth.uid() = id or public.is_admin());

-- Aucune politique DELETE : la suppression d'un compte passe par auth.users
-- (endpoint serveur avec service_role), ce qui cascade proprement.

-- ---------------------------------------------------------------- analyses --
create policy "analyses_select_own_public_or_admin" on public.analyses
    for select using (
        auth.uid() = user_id
        or public.is_admin()
        or (is_public and not is_removed)
    );

create policy "analyses_insert_own" on public.analyses
    for insert with check (auth.uid() = user_id and not public.is_suspended());

create policy "analyses_update_own_or_admin" on public.analyses
    for update using ((auth.uid() = user_id and not public.is_suspended())
                      or public.is_admin());

create policy "analyses_delete_own_or_admin" on public.analyses
    for delete using (auth.uid() = user_id or public.is_admin());

-- ----------------------------------------------------------- activity_logs --
create policy "activity_logs_select_own_or_admin" on public.activity_logs
    for select using (auth.uid() = user_id or public.is_admin());

-- WITH CHECK restreint : un utilisateur ne peut journaliser QUE sous sa propre
-- identité (l'ancienne politique `with check (true)` permettait l'usurpation).
create policy "activity_logs_insert_self" on public.activity_logs
    for insert with check (user_id is null or auth.uid() = user_id);

-- --------------------------------------------------------- system_settings --
-- Les réglages publics doivent être lisibles avant authentification, sinon le
-- mode maintenance et la fermeture des inscriptions ne peuvent pas s'appliquer
-- sur les pages Login / Signup.
create policy "system_settings_select_public_or_admin" on public.system_settings
    for select using (is_public or public.is_admin());

create policy "system_settings_write_super_admin" on public.system_settings
    for update using (public.is_super_admin());

create policy "system_settings_insert_super_admin" on public.system_settings
    for insert with check (public.is_super_admin());

-- -------------------------------------------------------- user_preferences --
create policy "user_preferences_all_own" on public.user_preferences
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "user_preferences_select_admin" on public.user_preferences
    for select using (public.is_admin());

-- ----------------------------------------------------------- notifications --
create policy "notifications_select_own_or_admin" on public.notifications
    for select using (auth.uid() = user_id or public.is_admin());

-- L'utilisateur ne peut que marquer comme lu (les autres colonnes sont figées
-- par le trigger ci-dessous).
create policy "notifications_update_own" on public.notifications
    for update using (auth.uid() = user_id);

create policy "notifications_insert_admin" on public.notifications
    for insert with check (public.is_admin());

create policy "notifications_delete_own_or_admin" on public.notifications
    for delete using (auth.uid() = user_id or public.is_admin());

create or replace function public.guard_notification_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if auth.uid() is not null and not public.is_admin() then
        new.title   := old.title;
        new.body    := old.body;
        new.level   := old.level;
        new.user_id := old.user_id;
    end if;
    if new.is_read and not old.is_read then
        new.read_at := now();
    end if;
    return new;
end;
$$;

drop trigger if exists trg_guard_notification_update on public.notifications;
create trigger trg_guard_notification_update
    before update on public.notifications
    for each row execute function public.guard_notification_update();

-- ============================================================================
-- SECTION 6 — RATTRAPAGE DES COMPTES EXISTANTS
-- ----------------------------------------------------------------------------
-- Crée les profils manquants pour les utilisateurs déjà présents dans
-- auth.users (comptes créés avant que le trigger ne fonctionne).
-- ============================================================================

insert into public.profiles (id, email, role, is_verified)
select u.id,
       u.email,
       case when lower(u.email) = lower(public.root_super_admin_email())
            then 'super_admin' else 'user' end,
       u.email_confirmed_at is not null
  from auth.users u
  left join public.profiles p on p.id = u.id
 where p.id is null
   and u.email is not null
on conflict (id) do nothing;

insert into public.user_preferences (user_id)
select p.id from public.profiles p
  left join public.user_preferences up on up.user_id = p.id
 where up.user_id is null
on conflict (user_id) do nothing;

-- Garantit que le super admin racine a bien son rôle. Le test sur la chaîne
-- vide est redondant aujourd'hui — aucune adresse ne vaut '' — mais il rend
-- l'intention explicite : pas de racine désignée, aucune promotion.
update public.profiles
   set role = 'super_admin', is_verified = true, is_suspended = false
 where public.root_super_admin_email() <> ''
   and lower(email) = lower(public.root_super_admin_email())
   and role <> 'super_admin';

-- ============================================================================
-- FIN 0001
-- ============================================================================
