-- ============================================================================
-- VerifyNet — 0005_admin_visibility_fixes.sql
-- ----------------------------------------------------------------------------
-- Corrige deux trous visibles dans la console super admin :
--
--   1. Journal d'audit vide
--      PostgREST refuse `activity_logs → profiles` quand la clé étrangère
--      `activity_logs_user_id_fkey` n'existe pas (schéma SIMPLE d'origine,
--      CREATE TABLE IF NOT EXISTS n'a alors jamais recréé la contrainte).
--      Le listing passe désormais par admin_list_activity_logs(), un LEFT JOIN
--      SQL qui n'a pas besoin de cette relation dans le cache PostgREST.
--
--   2. Analyses de visiteurs invisibles
--      Si `analyses.user_id` est resté NOT NULL, ou si les colonnes visiteur
--      n'existent pas encore, l'API ne peut pas enregistrer une analyse sans
--      compte. On rend user_id nullable, on garantit les colonnes, et on
--      expose record_anonymous_analysis() pour écrire hors du cache schéma.
--
-- Idempotent. Dépend de : 0001, 0002 (0003 et 0004 recommandés).
-- ============================================================================

set search_path = public;

-- ----------------------------------------------------------------------------
-- 1. Une analyse anonyme n'a pas d'auteur : user_id doit pouvoir être nul.
-- ----------------------------------------------------------------------------
alter table public.analyses alter column user_id drop not null;

alter table public.analyses add column if not exists visitor_hash      text;
alter table public.analyses add column if not exists visitor_ip_prefix text;
alter table public.analyses add column if not exists user_agent        text;

alter table public.analyses drop constraint if exists analyses_visitor_identified;
alter table public.analyses
    add constraint analyses_visitor_identified
    check (user_id is not null or visitor_hash is not null)
    not valid;

create index if not exists idx_analyses_visitor_hash
    on public.analyses(visitor_hash, created_at desc)
    where user_id is null;

create index if not exists idx_analyses_anonymous
    on public.analyses(created_at desc)
    where user_id is null;

alter table public.activity_logs add column if not exists visitor_hash text;
alter table public.activity_logs add column if not exists target_user_id uuid;
alter table public.activity_logs add column if not exists severity text;

-- Gravité : les bases anciennes n'avaient pas la colonne / la contrainte.
update public.activity_logs set severity = 'info' where severity is null;
alter table public.activity_logs alter column severity set default 'info';
alter table public.activity_logs drop constraint if exists activity_logs_severity_check;
alter table public.activity_logs
    add constraint activity_logs_severity_check
    check (severity in ('info', 'warning', 'critical'));

create index if not exists idx_activity_logs_visitor_hash
    on public.activity_logs(visitor_hash)
    where visitor_hash is not null;

-- ----------------------------------------------------------------------------
-- 2. Clé étrangère user_id → profiles, si elle manque.
--    Sans elle PostgREST ne connaît pas la relation et le embed du journal
--    échoue. On l'ajoute en NOT VALID pour ne pas rejeter d'anciennes lignes
--    orphelines. Le listing RPC n'en dépend plus, mais les embeds futurs oui.
-- ----------------------------------------------------------------------------
do $$
declare
    v_has_profiles_fk boolean;
begin
    select exists (
        select 1
          from pg_constraint c
          join pg_class src  on src.oid  = c.conrelid
          join pg_namespace ns on ns.oid = src.relnamespace
          join pg_class dst  on dst.oid  = c.confrelid
          join unnest(c.conkey) as col(attnum) on true
          join pg_attribute a on a.attrelid = src.oid and a.attnum = col.attnum
         where ns.nspname = 'public'
           and src.relname = 'activity_logs'
           and dst.relname = 'profiles'
           and c.contype = 'f'
           and a.attname = 'user_id'
    ) into v_has_profiles_fk;

    if not v_has_profiles_fk then
        begin
            alter table public.activity_logs
                add constraint activity_logs_user_id_fkey
                foreign key (user_id) references public.profiles(id)
                on delete set null
                not valid;
        exception when duplicate_object then
            null;
        when others then
            raise notice 'FK activity_logs_user_id_fkey non créée : %', sqlerrm;
        end;
    end if;
end;
$$;

insert into public.system_settings (key, value, description, category, value_type, is_public) values
    ('log_anonymous_analyses',  'true', 'Enregistrer les analyses des visiteurs non connectés', 'security', 'boolean', true),
    ('anonymous_retention_days','90',   'Suppression automatique des analyses anonymes après N jours (0 = jamais)', 'limits', 'number', false)
on conflict (key) do update set
    description = excluded.description,
    category    = excluded.category,
    value_type  = excluded.value_type,
    is_public   = excluded.is_public;

-- ----------------------------------------------------------------------------
-- 3. Journal d'audit : plus de embed PostgREST.
-- ----------------------------------------------------------------------------
drop function if exists public.admin_list_activity_logs(text, text, text, integer, integer);

create or replace function public.admin_list_activity_logs(
    p_search   text    default null,
    p_severity text    default null,
    p_audience text    default null,   -- 'members' | 'visitors'
    p_limit    integer default 100,
    p_offset   integer default 0
)
returns table (
    id            uuid,
    user_id       uuid,
    actor_email   text,
    actor_role    text,
    action        text,
    details       jsonb,
    ip_address    text,
    user_agent    text,
    created_at    timestamptz,
    target_user_id uuid,
    severity      text,
    visitor_hash  text,
    total_count   bigint
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
        select l.id, l.user_id, l.action, l.details, l.ip_address, l.user_agent,
               l.created_at, l.target_user_id, coalesce(l.severity, 'info') as severity,
               l.visitor_hash,
               p.email as actor_email,
               p.role  as actor_role
          from public.activity_logs l
          left join public.profiles p on p.id = l.user_id
         where (p_search is null or p_search = ''
                or l.action       ilike '%' || p_search || '%'
                or l.visitor_hash ilike '%' || p_search || '%'
                or p.email        ilike '%' || p_search || '%')
           and (p_severity is null or p_severity = '' or coalesce(l.severity, 'info') = p_severity)
           and (p_audience is null or p_audience = ''
                or (p_audience = 'visitors' and l.visitor_hash is not null)
                or (p_audience = 'members'  and l.visitor_hash is null))
    )
    select f.id, f.user_id, f.actor_email, f.actor_role, f.action, f.details,
           f.ip_address, f.user_agent, f.created_at, f.target_user_id, f.severity,
           f.visitor_hash,
           (select count(*) from filtered) as total_count
      from filtered f
     order by f.created_at desc
     limit  greatest(coalesce(p_limit, 100), 1)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

grant execute on function
    public.admin_list_activity_logs(text, text, text, integer, integer)
    to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Enregistrement d'une analyse anonyme, appelable uniquement en service_role.
--    Évite le cache schéma PostgREST (colonnes nouvellement ajoutées).
-- ----------------------------------------------------------------------------
create or replace function public.record_anonymous_analysis(
    p_visitor_hash           text,
    p_visitor_ip_prefix      text    default null,
    p_user_agent             text    default null,
    p_type                   text    default 'text',
    p_input                  text    default '',
    p_result                 jsonb   default '{}'::jsonb,
    p_score                  integer default null,
    p_verdict                text    default null,
    p_extracted_text         text    default null,
    p_extraction_method      text    default null,
    p_extraction_confidence  numeric default null,
    p_file_name              text    default null,
    p_file_mime              text    default null,
    p_file_size              bigint  default null,
    p_page_count             integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_id uuid;
    v_type text := coalesce(nullif(trim(p_type), ''), 'text');
begin
    if auth.role() is distinct from 'service_role' then
        raise exception 'ACCES_REFUSE: enregistrement anonyme réservé à l''API.'
            using errcode = '42501';
    end if;

    if p_visitor_hash is null or length(trim(p_visitor_hash)) = 0 then
        raise exception 'PARAMETRE_INVALIDE: empreinte visiteur manquante.';
    end if;

    if not public.setting_bool('log_anonymous_analyses', true) then
        return null;
    end if;

    if v_type not in ('text', 'url', 'image', 'document') then
        v_type := 'text';
    end if;

    insert into public.analyses (
        user_id, type, input, result, score, verdict,
        extracted_text, extraction_method, extraction_confidence,
        file_name, file_mime, file_size, page_count,
        visitor_hash, visitor_ip_prefix, user_agent
    ) values (
        null, v_type, left(coalesce(p_input, ''), 500), coalesce(p_result, '{}'::jsonb),
        p_score, p_verdict,
        p_extracted_text, p_extraction_method, p_extraction_confidence,
        p_file_name, p_file_mime, p_file_size, p_page_count,
        trim(p_visitor_hash), p_visitor_ip_prefix, p_user_agent
    )
    returning id into v_id;

    insert into public.activity_logs (
        user_id, action, details, severity, visitor_hash, ip_address, user_agent
    ) values (
        null,
        'ANONYMOUS_ANALYSIS',
        jsonb_build_object(
            'analysis_id', v_id,
            'type',        v_type,
            'score',       p_score,
            'verdict',     p_verdict,
            'file_name',   p_file_name
        ),
        'info',
        trim(p_visitor_hash),
        p_visitor_ip_prefix,
        p_user_agent
    );

    return v_id;
end;
$$;

revoke execute on function public.record_anonymous_analysis(
    text, text, text, text, text, jsonb, integer, text, text, text, numeric, text, text, bigint, integer
) from public;
revoke execute on function public.record_anonymous_analysis(
    text, text, text, text, text, jsonb, integer, text, text, text, numeric, text, text, bigint, integer
) from anon, authenticated;
grant execute on function public.record_anonymous_analysis(
    text, text, text, text, text, jsonb, integer, text, text, text, numeric, text, text, bigint, integer
) to service_role;

-- ----------------------------------------------------------------------------
-- 5. Liste des analyses : signature avec p_audience (au cas où 0004 manque).
-- ----------------------------------------------------------------------------
drop function if exists public.admin_list_analyses(text, text, text, integer, integer);

create or replace function public.admin_list_analyses(
    p_search   text    default null,
    p_type     text    default null,
    p_status   text    default null,
    p_limit    integer default 50,
    p_offset   integer default 0,
    p_audience text    default null
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
    visitor_hash      text,
    visitor_ip_prefix text,
    user_agent        text,
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
               a.visitor_hash, a.visitor_ip_prefix, a.user_agent,
               p.email as author_email,
               coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
                        p.username) as author_name
          from public.analyses a
          left join public.profiles p on p.id = a.user_id
         where (p_search is null or p_search = ''
                or a.input        ilike '%' || p_search || '%'
                or a.verdict      ilike '%' || p_search || '%'
                or p.email        ilike '%' || p_search || '%'
                or a.visitor_hash ilike '%' || p_search || '%')
           and (p_type   is null or p_type   = '' or a.type = p_type)
           and (p_status is null or p_status = ''
                or (p_status = 'removed' and a.is_removed)
                or (p_status = 'active'  and not a.is_removed))
           and (p_audience is null or p_audience = ''
                or (p_audience = 'members'  and a.user_id is not null)
                or (p_audience = 'visitors' and a.user_id is null))
    )
    select f.id, f.user_id, f.author_email, f.author_name, f.type,
           left(f.input, 300) as input, f.score, f.verdict, f.file_name,
           f.extraction_method, f.is_removed, f.removal_reason, f.is_public,
           f.share_slug, f.created_at,
           f.visitor_hash, f.visitor_ip_prefix, f.user_agent,
           (select count(*) from filtered) as total_count
      from filtered f
     order by f.created_at desc
     limit  greatest(coalesce(p_limit, 50), 1)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

grant execute on function
    public.admin_list_analyses(text, text, text, integer, integer, text)
    to authenticated;

-- Quota visiteur (si 0004 n'a pas été joué).
create or replace function public.visitor_usage_today(p_visitor_hash text)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select count(*)::integer
      from public.analyses
     where user_id is null
       and visitor_hash = p_visitor_hash
       and created_at >= date_trunc('day', now());
$$;

revoke execute on function public.visitor_usage_today(text) from public;
revoke execute on function public.visitor_usage_today(text) from anon, authenticated;
grant  execute on function public.visitor_usage_today(text) to   service_role;

-- ----------------------------------------------------------------------------
-- 6. Statistiques visiteurs (si 0004 n'a pas été joué).
-- ----------------------------------------------------------------------------
create or replace function public.admin_visitor_stats(p_days integer default 14)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
    v_days  integer := greatest(least(coalesce(p_days, 14), 90), 1);
    v_stats jsonb;
    v_series jsonb;
    v_top   jsonb;
begin
    perform public.require_admin();

    select jsonb_build_object(
        'analyses_total',   count(*),
        'analyses_today',   count(*) filter (where created_at >= date_trunc('day', now())),
        'analyses_last_7d', count(*) filter (where created_at >= now() - interval '7 days'),
        'visitors_total',   count(distinct visitor_hash),
        'visitors_today',   count(distinct visitor_hash)
                              filter (where created_at >= date_trunc('day', now())),
        'visitors_last_7d', count(distinct visitor_hash)
                              filter (where created_at >= now() - interval '7 days'),
        'avg_score',        round(coalesce(avg(score), 0)::numeric, 1),
        'by_type',          jsonb_build_object(
            'text',     count(*) filter (where type = 'text'),
            'url',      count(*) filter (where type = 'url'),
            'image',    count(*) filter (where type = 'image'),
            'document', count(*) filter (where type = 'document')
        )
    ) into v_stats
      from public.analyses
     where user_id is null;

    select coalesce(jsonb_agg(row_to_json(d)::jsonb order by d.day), '[]'::jsonb)
      into v_series
      from (
        select to_char(g.day, 'YYYY-MM-DD') as day,
               (select count(*) from public.analyses a
                 where a.user_id is not null
                   and a.created_at >= g.day
                   and a.created_at <  g.day + interval '1 day') as members,
               (select count(*) from public.analyses a
                 where a.user_id is null
                   and a.created_at >= g.day
                   and a.created_at <  g.day + interval '1 day') as visitors
          from generate_series(
                 date_trunc('day', now()) - ((v_days - 1) || ' days')::interval,
                 date_trunc('day', now()),
                 interval '1 day'
               ) as g(day)
      ) d;

    select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.analyses desc), '[]'::jsonb)
      into v_top
      from (
        select visitor_hash,
               visitor_ip_prefix,
               count(*)      as analyses,
               max(created_at) as last_seen
          from public.analyses
         where user_id is null
           and created_at >= now() - interval '24 hours'
         group by visitor_hash, visitor_ip_prefix
         order by count(*) desc
         limit 10
      ) t;

    return jsonb_build_object(
        'stats',  coalesce(v_stats, '{}'::jsonb),
        'series', v_series,
        'top',    v_top,
        'days',   v_days
    );
end;
$$;

grant execute on function public.admin_visitor_stats(integer) to authenticated;

-- ----------------------------------------------------------------------------
-- 7. Recharge le cache PostgREST pour que les nouvelles fonctions/colonnes
--    soient visibles immédiatement, sans attendre le TTL.
-- ----------------------------------------------------------------------------
notify pgrst, 'reload schema';

do $$
begin
    raise notice '0005 : journal d''audit via admin_list_activity_logs(), analyses anonymes enregistrables.';
end;
$$;
