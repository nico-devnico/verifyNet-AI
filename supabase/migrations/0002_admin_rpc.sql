-- ============================================================================
-- VerifyNet — 0002_admin_rpc.sql
-- ----------------------------------------------------------------------------
-- Couche d'actions privilégiées.
--
-- Principe : le frontend n'écrit JAMAIS directement dans les colonnes
-- sensibles. Il appelle ces fonctions RPC qui, en un seul aller-retour :
--     1. vérifient l'autorisation de l'appelant côté serveur,
--     2. appliquent la modification en base,
--     3. écrivent une entrée d'audit dans activity_logs.
--
-- Conséquence : toute action du super admin s'applique réellement à la base
-- Supabase et devient traçable, et un utilisateur qui forgerait une requête
-- HTTP directe se fait refuser par la fonction elle-même.
--
-- Dépend de : 0001_core_schema.sql
-- ============================================================================

set search_path = public;

-- ============================================================================
-- SECTION 1 — GARDES ET AUDIT
-- ============================================================================

create or replace function public.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
    if not public.is_admin() then
        raise exception 'ACCES_REFUSE: privilèges administrateur requis.'
            using errcode = '42501';
    end if;
end;
$$;

create or replace function public.require_super_admin()
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
    if not public.is_super_admin() then
        raise exception 'ACCES_REFUSE: privilèges super administrateur requis.'
            using errcode = '42501';
    end if;
end;
$$;

create or replace function public.write_audit(
    p_action    text,
    p_details   jsonb default '{}'::jsonb,
    p_target    uuid  default null,
    p_severity  text  default 'info'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_id uuid;
begin
    insert into public.activity_logs (user_id, target_user_id, action, details, severity)
    values (auth.uid(), p_target, p_action, coalesce(p_details, '{}'::jsonb), p_severity)
    returning id into v_id;
    return v_id;
end;
$$;

-- Journalisation appelable par le client (empêche l'usurpation d'identité :
-- user_id est toujours pris de auth.uid(), jamais du payload).
create or replace function public.log_activity(
    p_action   text,
    p_details  jsonb default '{}'::jsonb,
    p_severity text  default 'info'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if p_severity not in ('info', 'warning', 'critical') then
        p_severity := 'info';
    end if;
    return public.write_audit(p_action, p_details, null, p_severity);
end;
$$;

grant execute on function public.log_activity(text, jsonb, text) to authenticated;

-- ============================================================================
-- SECTION 2 — GESTION DES UTILISATEURS
-- ============================================================================

-- Promotion / rétrogradation. Réservé au super admin.
create or replace function public.admin_set_user_role(
    p_user_id uuid,
    p_role    text
)
returns public.profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_target public.profiles;
    v_old    text;
begin
    perform public.require_super_admin();

    if p_role not in ('user', 'admin', 'super_admin') then
        raise exception 'ROLE_INVALIDE: % (attendu user, admin ou super_admin)', p_role;
    end if;

    select * into v_target from public.profiles where id = p_user_id;
    if not found then
        raise exception 'UTILISATEUR_INTROUVABLE: %', p_user_id;
    end if;

    if lower(v_target.email) = lower(public.root_super_admin_email()) then
        raise exception 'COMPTE_PROTEGE: le super administrateur racine ne peut pas être modifié.';
    end if;

    if p_user_id = auth.uid() and p_role <> 'super_admin' then
        raise exception 'ACTION_REFUSEE: vous ne pouvez pas vous rétrograder vous-même.';
    end if;

    v_old := v_target.role;

    update public.profiles
       set role = p_role
     where id = p_user_id
    returning * into v_target;

    perform public.write_audit(
        'ADMIN_USER_ROLE_CHANGED',
        jsonb_build_object('email', v_target.email, 'from', v_old, 'to', p_role),
        p_user_id,
        case when p_role = 'super_admin' then 'critical' else 'warning' end
    );

    return v_target;
end;
$$;

-- Suspension / réactivation. La suspension est réellement appliquée : les
-- politiques RLS de 0001 bloquent toute écriture d'un compte suspendu, et le
-- frontend le déconnecte.
create or replace function public.admin_set_user_suspension(
    p_user_id uuid,
    p_suspend boolean,
    p_reason  text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_target public.profiles;
begin
    perform public.require_super_admin();

    select * into v_target from public.profiles where id = p_user_id;
    if not found then
        raise exception 'UTILISATEUR_INTROUVABLE: %', p_user_id;
    end if;

    if lower(v_target.email) = lower(public.root_super_admin_email()) then
        raise exception 'COMPTE_PROTEGE: le super administrateur racine ne peut pas être suspendu.';
    end if;

    if p_user_id = auth.uid() then
        raise exception 'ACTION_REFUSEE: vous ne pouvez pas vous suspendre vous-même.';
    end if;

    update public.profiles
       set is_suspended      = p_suspend,
           suspended_at      = case when p_suspend then now() else null end,
           suspension_reason = case when p_suspend then p_reason else null end
     where id = p_user_id
    returning * into v_target;

    -- L'utilisateur est prévenu dans l'application
    insert into public.notifications (user_id, title, body, level, created_by)
    values (
        p_user_id,
        case when p_suspend then 'Votre compte a été suspendu'
             else 'Votre compte a été réactivé' end,
        case when p_suspend
             then coalesce(p_reason, 'Contactez l''administrateur pour plus d''informations.')
             else 'Vous pouvez à nouveau utiliser VerifyNet.' end,
        case when p_suspend then 'critical' else 'success' end,
        auth.uid()
    );

    perform public.write_audit(
        case when p_suspend then 'ADMIN_USER_SUSPENDED' else 'ADMIN_USER_REACTIVATED' end,
        jsonb_build_object('email', v_target.email, 'reason', p_reason),
        p_user_id,
        'critical'
    );

    return v_target;
end;
$$;

-- Quota d'analyses personnalisé (null = quota global)
create or replace function public.admin_set_user_quota(
    p_user_id uuid,
    p_quota   integer
)
returns public.profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_target public.profiles;
begin
    perform public.require_super_admin();

    if p_quota is not null and p_quota < 0 then
        raise exception 'QUOTA_INVALIDE: la valeur doit être positive ou nulle.';
    end if;

    update public.profiles
       set daily_quota_override = p_quota
     where id = p_user_id
    returning * into v_target;

    if not found then
        raise exception 'UTILISATEUR_INTROUVABLE: %', p_user_id;
    end if;

    perform public.write_audit(
        'ADMIN_USER_QUOTA_CHANGED',
        jsonb_build_object('email', v_target.email, 'quota', p_quota),
        p_user_id,
        'warning'
    );

    return v_target;
end;
$$;

-- Liste paginée et filtrable, avec le compte d'analyses par utilisateur.
create or replace function public.admin_list_users(
    p_search text    default null,
    p_role   text    default null,
    p_status text    default null,   -- 'active' | 'suspended'
    p_limit  integer default 50,
    p_offset integer default 0
)
returns table (
    id                   uuid,
    email                text,
    role                 text,
    username             text,
    first_name           text,
    last_name            text,
    avatar_url           text,
    is_verified          boolean,
    is_suspended         boolean,
    suspended_at         timestamptz,
    suspension_reason    text,
    daily_quota_override integer,
    last_seen_at         timestamptz,
    created_at           timestamptz,
    analyses_count       bigint,
    analyses_today       bigint,
    is_root              boolean,
    total_count          bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
    perform public.require_admin();

    return query
    with filtered as (
        select p.*
          from public.profiles p
         where (p_search is null or p_search = ''
                or p.email      ilike '%' || p_search || '%'
                or p.username   ilike '%' || p_search || '%'
                or p.first_name ilike '%' || p_search || '%'
                or p.last_name  ilike '%' || p_search || '%')
           and (p_role   is null or p_role   = '' or p.role = p_role)
           and (p_status is null or p_status = ''
                or (p_status = 'suspended' and p.is_suspended)
                or (p_status = 'active'    and not p.is_suspended))
    )
    select f.id, f.email, f.role, f.username, f.first_name, f.last_name,
           f.avatar_url, f.is_verified, f.is_suspended, f.suspended_at,
           f.suspension_reason, f.daily_quota_override, f.last_seen_at, f.created_at,
           coalesce(a.total, 0) as analyses_count,
           coalesce(a.today, 0) as analyses_today,
           lower(f.email) = lower(public.root_super_admin_email()) as is_root,
           (select count(*) from filtered) as total_count
      from filtered f
      left join (
            select an.user_id,
                   count(*) as total,
                   count(*) filter (where an.created_at >= date_trunc('day', now())) as today
              from public.analyses an
             group by an.user_id
      ) a on a.user_id = f.id
     order by
        case f.role when 'super_admin' then 0 when 'admin' then 1 else 2 end,
        f.created_at desc
     limit  greatest(coalesce(p_limit, 50), 1)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- ============================================================================
-- SECTION 3 — MODÉRATION DU CONTENU
-- ============================================================================

create or replace function public.admin_moderate_analysis(
    p_analysis_id uuid,
    p_remove      boolean,
    p_reason      text default null
)
returns public.analyses
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_row public.analyses;
begin
    perform public.require_admin();

    update public.analyses
       set is_removed     = p_remove,
           removed_at     = case when p_remove then now() else null end,
           removed_by     = case when p_remove then auth.uid() else null end,
           removal_reason = case when p_remove then p_reason else null end,
           is_public      = case when p_remove then false else is_public end
     where id = p_analysis_id
    returning * into v_row;

    if not found then
        raise exception 'ANALYSE_INTROUVABLE: %', p_analysis_id;
    end if;

    perform public.write_audit(
        case when p_remove then 'ADMIN_ANALYSIS_REMOVED' else 'ADMIN_ANALYSIS_RESTORED' end,
        jsonb_build_object('analysis_id', p_analysis_id, 'reason', p_reason,
                           'type', v_row.type, 'verdict', v_row.verdict),
        v_row.user_id,
        'warning'
    );

    return v_row;
end;
$$;

-- Suppression définitive (super admin uniquement)
create or replace function public.admin_delete_analysis(p_analysis_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_row public.analyses;
begin
    perform public.require_super_admin();

    select * into v_row from public.analyses where id = p_analysis_id;
    if not found then
        raise exception 'ANALYSE_INTROUVABLE: %', p_analysis_id;
    end if;

    delete from public.analyses where id = p_analysis_id;

    perform public.write_audit(
        'ADMIN_ANALYSIS_PURGED',
        jsonb_build_object('analysis_id', p_analysis_id, 'type', v_row.type,
                           'file_name', v_row.file_name),
        v_row.user_id,
        'critical'
    );

    return true;
end;
$$;

-- Liste paginée des analyses pour la modération, avec l'auteur.
create or replace function public.admin_list_analyses(
    p_search  text    default null,
    p_type    text    default null,
    p_status  text    default null,   -- 'active' | 'removed'
    p_limit   integer default 50,
    p_offset  integer default 0
)
returns table (
    id                uuid,
    user_id           uuid,
    author_email      text,
    author_name       text,
    type              text,
    input             text,
    score             integer,
    verdict           text,
    file_name         text,
    extraction_method text,
    is_removed        boolean,
    removal_reason    text,
    is_public         boolean,
    share_slug        text,
    created_at        timestamptz,
    total_count       bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
    perform public.require_admin();

    return query
    with filtered as (
        select a.id, a.user_id, a.type, a.input, a.score, a.verdict, a.file_name,
               a.extraction_method, a.is_removed, a.removal_reason, a.is_public,
               a.share_slug, a.created_at,
               p.email as author_email,
               coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
                        p.username) as author_name
          from public.analyses a
          left join public.profiles p on p.id = a.user_id
         where (p_search is null or p_search = ''
                or a.input   ilike '%' || p_search || '%'
                or a.verdict ilike '%' || p_search || '%'
                or p.email   ilike '%' || p_search || '%')
           and (p_type   is null or p_type   = '' or a.type = p_type)
           and (p_status is null or p_status = ''
                or (p_status = 'removed' and a.is_removed)
                or (p_status = 'active'  and not a.is_removed))
    )
    select f.id, f.user_id, f.author_email, f.author_name, f.type,
           left(f.input, 300) as input, f.score, f.verdict, f.file_name,
           f.extraction_method, f.is_removed, f.removal_reason, f.is_public,
           f.share_slug, f.created_at,
           (select count(*) from filtered) as total_count
      from filtered f
     order by f.created_at desc
     limit  greatest(coalesce(p_limit, 50), 1)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- ============================================================================
-- SECTION 4 — PARAMÈTRES SYSTÈME
-- ============================================================================

create or replace function public.admin_update_setting(
    p_key   text,
    p_value text
)
returns public.system_settings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_row public.system_settings;
    v_old text;
begin
    perform public.require_super_admin();

    select * into v_row from public.system_settings where key = p_key;
    if not found then
        raise exception 'PARAMETRE_INCONNU: %', p_key;
    end if;
    v_old := v_row.value;

    -- Validation selon le type déclaré
    if v_row.value_type = 'boolean' then
        if lower(p_value) not in ('true', 'false') then
            raise exception 'VALEUR_INVALIDE: "%" doit être true ou false.', p_key;
        end if;
        p_value := lower(p_value);
    elsif v_row.value_type = 'number' then
        if p_value !~ '^-?\d+(\.\d+)?$' then
            raise exception 'VALEUR_INVALIDE: "%" doit être un nombre.', p_key;
        end if;
    end if;

    -- Le compte racine ne peut pas être réassigné depuis l'UI : ce serait une
    -- porte dérobée pour s'octroyer un rôle intouchable.
    if p_key = 'root_super_admin_email' then
        raise exception 'PARAMETRE_VERROUILLE: root_super_admin_email se modifie uniquement en SQL.';
    end if;

    update public.system_settings
       set value      = p_value,
           updated_by = auth.uid(),
           updated_at = now()
     where key = p_key
    returning * into v_row;

    perform public.write_audit(
        'ADMIN_SETTING_UPDATED',
        jsonb_build_object('key', p_key, 'from', v_old, 'to', p_value),
        null,
        case when p_key in ('maintenance_mode', 'enable_registrations')
             then 'critical' else 'warning' end
    );

    return v_row;
end;
$$;

-- ============================================================================
-- SECTION 5 — NOTIFICATIONS / DIFFUSION
-- ============================================================================

create or replace function public.admin_broadcast_notification(
    p_title  text,
    p_body   text default null,
    p_level  text default 'info',
    p_target text default 'all'      -- 'all' | 'user' | 'admin' | 'super_admin'
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_count integer;
begin
    perform public.require_super_admin();

    if p_title is null or trim(p_title) = '' then
        raise exception 'TITRE_REQUIS: le titre de la notification est obligatoire.';
    end if;
    if p_level not in ('info', 'success', 'warning', 'critical') then
        p_level := 'info';
    end if;

    insert into public.notifications (user_id, title, body, level, created_by)
    select p.id, p_title, p_body, p_level, auth.uid()
      from public.profiles p
     where (p_target = 'all' or p.role = p_target)
       and not p.is_suspended;

    get diagnostics v_count = row_count;

    perform public.write_audit(
        'ADMIN_BROADCAST_SENT',
        jsonb_build_object('title', p_title, 'target', p_target,
                           'level', p_level, 'recipients', v_count),
        null,
        'warning'
    );

    return v_count;
end;
$$;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_count integer;
begin
    if auth.uid() is null then
        raise exception 'NON_AUTHENTIFIE';
    end if;

    update public.notifications
       set is_read = true, read_at = now()
     where user_id = auth.uid() and not is_read;

    get diagnostics v_count = row_count;
    return v_count;
end;
$$;

grant execute on function public.mark_all_notifications_read() to authenticated;

-- ============================================================================
-- SECTION 6 — QUOTAS ET STATISTIQUES
-- ============================================================================

-- Consommation du jour pour l'utilisateur courant. Le frontend l'affiche,
-- le serveur s'en sert pour refuser une analyse au-delà du quota.
create or replace function public.my_usage_today()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
    v_used  integer;
    v_limit integer;
    v_over  integer;
begin
    if auth.uid() is null then
        return jsonb_build_object('authenticated', false);
    end if;

    select count(*) into v_used
      from public.analyses
     where user_id = auth.uid()
       and created_at >= date_trunc('day', now());

    select daily_quota_override into v_over
      from public.profiles where id = auth.uid();

    v_limit := coalesce(v_over, nullif(public.setting('max_analyses_per_day'), '')::integer, 100);

    -- Les administrateurs ne sont pas limités
    if public.is_admin() then
        v_limit := 2147483647;
    end if;

    return jsonb_build_object(
        'authenticated', true,
        'used',          v_used,
        'limit',         v_limit,
        'remaining',     greatest(v_limit - v_used, 0),
        'unlimited',     v_limit >= 2147483647
    );
end;
$$;

grant execute on function public.my_usage_today() to authenticated;

-- Statistiques réelles de la plateforme (remplace les valeurs de démonstration
-- et les Math.random() de l'ancienne page super admin).
create or replace function public.admin_platform_stats(p_days integer default 14)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
    v_days   integer := greatest(least(coalesce(p_days, 14), 90), 1);
    v_users  jsonb;
    v_an     jsonb;
    v_series jsonb;
    v_logs   jsonb;
    v_top    jsonb;
begin
    perform public.require_admin();

    select jsonb_build_object(
        'total',      count(*),
        'admins',     count(*) filter (where role in ('admin', 'super_admin')),
        'suspended',  count(*) filter (where is_suspended),
        'verified',   count(*) filter (where is_verified),
        'new_7d',     count(*) filter (where created_at >= now() - interval '7 days'),
        'active_24h', count(*) filter (where last_seen_at >= now() - interval '24 hours')
    ) into v_users
      from public.profiles;

    select jsonb_build_object(
        'total',        count(*),
        'today',        count(*) filter (where created_at >= date_trunc('day', now())),
        'last_7d',      count(*) filter (where created_at >= now() - interval '7 days'),
        'removed',      count(*) filter (where is_removed),
        'shared',       count(*) filter (where is_public),
        'avg_score',    round(coalesce(avg(score), 0)::numeric, 1),
        'by_type',      jsonb_build_object(
            'text',     count(*) filter (where type = 'text'),
            'url',      count(*) filter (where type = 'url'),
            'image',    count(*) filter (where type = 'image'),
            'document', count(*) filter (where type = 'document')
        ),
        'by_reliability', jsonb_build_object(
            'credible', count(*) filter (where score >= 61),
            'uncertain',count(*) filter (where score between 41 and 60),
            'doubtful', count(*) filter (where score between 21 and 40),
            'fake',     count(*) filter (where score is not null and score <= 20)
        )
    ) into v_an
      from public.analyses;

    select coalesce(jsonb_agg(row_to_json(d)::jsonb order by d.day), '[]'::jsonb)
      into v_series
      from (
        select to_char(g.day, 'YYYY-MM-DD') as day,
               (select count(*) from public.analyses a
                 where a.created_at >= g.day and a.created_at < g.day + interval '1 day') as analyses,
               (select count(*) from public.profiles p
                 where p.created_at >= g.day and p.created_at < g.day + interval '1 day') as signups
          from generate_series(
                 date_trunc('day', now()) - ((v_days - 1) || ' days')::interval,
                 date_trunc('day', now()),
                 interval '1 day'
               ) as g(day)
      ) d;

    select jsonb_build_object(
        'total',       count(*),
        'critical_7d', count(*) filter (where severity = 'critical'
                                          and created_at >= now() - interval '7 days'),
        'last_24h',    count(*) filter (where created_at >= now() - interval '24 hours')
    ) into v_logs
      from public.activity_logs;

    select coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
      into v_top
      from (
        select p.email, count(a.id) as analyses
          from public.analyses a
          join public.profiles p on p.id = a.user_id
         where a.created_at >= now() - interval '30 days'
         group by p.email
         order by count(a.id) desc
         limit 5
      ) t;

    return jsonb_build_object(
        'users',        v_users,
        'analyses',     v_an,
        'series',       v_series,
        'logs',         v_logs,
        'top_users',    v_top,
        'generated_at', now()
    );
end;
$$;

-- Purge de la piste d'audit
create or replace function public.admin_purge_activity_logs(p_older_than_days integer default 90)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_count integer;
begin
    perform public.require_super_admin();

    if p_older_than_days < 1 then
        raise exception 'PARAMETRE_INVALIDE: p_older_than_days doit être >= 1.';
    end if;

    delete from public.activity_logs
     where created_at < now() - (p_older_than_days || ' days')::interval;

    get diagnostics v_count = row_count;

    perform public.write_audit(
        'ADMIN_LOGS_PURGED',
        jsonb_build_object('older_than_days', p_older_than_days, 'deleted', v_count),
        null, 'critical'
    );

    return v_count;
end;
$$;

-- ============================================================================
-- SECTION 7 — PRÉSENCE ET PARTAGE
-- ============================================================================

create or replace function public.touch_last_seen()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if auth.uid() is not null then
        update public.profiles set last_seen_at = now() where id = auth.uid();
    end if;
end;
$$;

grant execute on function public.touch_last_seen() to authenticated;

-- Génère (ou révoque) le lien de partage public d'un rapport
create or replace function public.toggle_analysis_sharing(
    p_analysis_id uuid,
    p_public      boolean
)
returns public.analyses
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_row  public.analyses;
    v_slug text;
begin
    if auth.uid() is null then
        raise exception 'NON_AUTHENTIFIE';
    end if;

    select * into v_row from public.analyses where id = p_analysis_id;
    if not found then
        raise exception 'ANALYSE_INTROUVABLE: %', p_analysis_id;
    end if;
    if v_row.user_id <> auth.uid() and not public.is_admin() then
        raise exception 'ACCES_REFUSE: ce rapport ne vous appartient pas.' using errcode = '42501';
    end if;
    if p_public and not public.setting_bool('enable_public_sharing', true) then
        raise exception 'FONCTION_DESACTIVEE: le partage public est désactivé par l''administrateur.';
    end if;
    if p_public and v_row.is_removed then
        raise exception 'ANALYSE_MODEREE: ce rapport a été retiré et ne peut pas être partagé.';
    end if;

    v_slug := coalesce(v_row.share_slug, encode(gen_random_bytes(9), 'hex'));

    update public.analyses
       set is_public  = p_public,
           share_slug = case when p_public then v_slug else null end
     where id = p_analysis_id
    returning * into v_row;

    return v_row;
end;
$$;

grant execute on function public.toggle_analysis_sharing(uuid, boolean) to authenticated;

-- Lecture d'un rapport partagé, sans authentification.
create or replace function public.get_shared_analysis(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select jsonb_build_object(
        'id',         a.id,
        'type',       a.type,
        'score',      a.score,
        'verdict',    a.verdict,
        'result',     a.result,
        'file_name',  a.file_name,
        'created_at', a.created_at
    )
      from public.analyses a
     where a.share_slug = p_slug
       and a.is_public
       and not a.is_removed
     limit 1;
$$;

grant execute on function public.get_shared_analysis(text) to anon, authenticated;

-- ============================================================================
-- SECTION 8 — DROITS D'EXÉCUTION
-- ============================================================================

-- Les fonctions admin_* sont exposées à `authenticated` : l'autorisation réelle
-- est faite DANS la fonction (require_admin / require_super_admin). Un simple
-- utilisateur qui les appelle reçoit une erreur 42501.
grant execute on function public.admin_set_user_role(uuid, text)                        to authenticated;
grant execute on function public.admin_set_user_suspension(uuid, boolean, text)         to authenticated;
grant execute on function public.admin_set_user_quota(uuid, integer)                    to authenticated;
grant execute on function public.admin_list_users(text, text, text, integer, integer)   to authenticated;
grant execute on function public.admin_moderate_analysis(uuid, boolean, text)           to authenticated;
grant execute on function public.admin_delete_analysis(uuid)                            to authenticated;
grant execute on function public.admin_list_analyses(text, text, text, integer, integer) to authenticated;
grant execute on function public.admin_update_setting(text, text)                       to authenticated;
grant execute on function public.admin_broadcast_notification(text, text, text, text)   to authenticated;
grant execute on function public.admin_platform_stats(integer)                          to authenticated;
grant execute on function public.admin_purge_activity_logs(integer)                     to authenticated;

-- Ces helpers ne doivent PAS être appelables directement par le client
-- Le privilège EXECUTE par défaut est accordé à PUBLIC, dont `anon` et
-- `authenticated` héritent : c'est à PUBLIC qu'il faut le retirer, sinon le
-- revoke ci-dessous n'a aucun effet et n'importe quel compte connecté peut
-- fabriquer une entrée d'audit. Les fonctions admin_* ne sont pas concernées :
-- étant SECURITY DEFINER, elles appellent write_audit() avec les droits du
-- propriétaire.
revoke execute on function public.write_audit(text, jsonb, uuid, text) from public;
revoke execute on function public.write_audit(text, jsonb, uuid, text) from anon, authenticated;

-- ============================================================================
-- SECTION 9 — STOCKAGE DES FICHIERS ANALYSÉS
-- ----------------------------------------------------------------------------
-- Bucket privé. Convention de chemin : <user_id>/<uuid>.<ext>
-- Encapsulé dans un bloc d'exception : selon le rôle utilisé pour exécuter la
-- migration, la modification de storage.objects peut être refusée. Dans ce cas
-- l'application continue de fonctionner, seul l'archivage des fichiers est
-- indisponible (le texte extrait, lui, est toujours enregistré).
-- ============================================================================

do $$
begin
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
        'analysis-uploads', 'analysis-uploads', false, 15728640,
        array['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif',
              'image/bmp', 'image/tiff', 'application/pdf', 'text/plain',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    )
    on conflict (id) do update set
        public             = false,
        file_size_limit    = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;
exception when others then
    raise notice 'Bucket analysis-uploads non créé (%). Créez-le manuellement dans Storage.', sqlerrm;
end;
$$;

do $$
begin
    drop policy if exists "uploads_insert_own_folder" on storage.objects;
    drop policy if exists "uploads_select_own_or_admin" on storage.objects;
    drop policy if exists "uploads_delete_own_or_admin" on storage.objects;

    create policy "uploads_insert_own_folder" on storage.objects
        for insert to authenticated
        with check (
            bucket_id = 'analysis-uploads'
            and (storage.foldername(name))[1] = auth.uid()::text
            and not public.is_suspended()
        );

    create policy "uploads_select_own_or_admin" on storage.objects
        for select to authenticated
        using (
            bucket_id = 'analysis-uploads'
            and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
        );

    create policy "uploads_delete_own_or_admin" on storage.objects
        for delete to authenticated
        using (
            bucket_id = 'analysis-uploads'
            and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
        );
exception when others then
    raise notice 'Politiques storage non appliquées (%).', sqlerrm;
end;
$$;

-- ============================================================================
-- FIN 0002
-- ============================================================================
