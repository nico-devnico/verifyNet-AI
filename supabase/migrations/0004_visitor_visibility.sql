-- ============================================================================
-- VerifyNet — 0004_visitor_visibility.sql
-- ----------------------------------------------------------------------------
-- Rend visible au super admin l'activité des visiteurs non connectés.
--
-- Jusqu'ici une analyse lancée sans compte ne laissait aucune trace : elle
-- n'existait que dans le localStorage du navigateur, et le quota anonyme était
-- un compteur en mémoire dans le processus Node — remis à zéro à chaque
-- redémarrage et non partagé entre instances. La console super admin annonçait
-- donc un volume d'activité systématiquement sous-estimé.
--
-- Désormais chaque analyse anonyme est écrite dans `public.analyses` avec
-- `user_id is null`, accompagnée d'une identité pseudonyme du visiteur.
--
-- Choix de conception sur la vie privée
-- -------------------------------------
-- On ne conserve jamais l'adresse IP brute. Deux colonnes suffisent :
--
--   • `visitor_hash`      empreinte stable (HMAC calculée côté serveur à partir
--                         de l'IP, de l'agent utilisateur et d'un secret) ;
--                         permet de compter les visiteurs distincts, d'appliquer
--                         un quota et de relier les analyses d'une même session,
--                         sans permettre de remonter à la personne.
--   • `visitor_ip_prefix` IP tronquée (/24 en IPv4, /48 en IPv6) ; donne un
--                         ordre d'idée géographique et permet de repérer un abus
--                         provenant d'un même réseau, sans identifier une machine.
--
-- L'agent utilisateur est conservé tel quel : il n'identifie pas une personne et
-- sert à distinguer un navigateur réel d'un robot.
--
-- Le script est idempotent.
--
-- Dépend de : 0001_core_schema.sql, 0002_admin_rpc.sql
-- ============================================================================

set search_path = public;

-- ----------------------------------------------------------------------------
-- 1. Identité pseudonyme du visiteur sur les analyses.
-- ----------------------------------------------------------------------------
alter table public.analyses add column if not exists visitor_hash      text;
alter table public.analyses add column if not exists visitor_ip_prefix text;
alter table public.analyses add column if not exists user_agent        text;

/*
 * Une ligne est « anonyme » quand user_id est nul. La colonne calculée évite
 * d'éparpiller cette règle dans les requêtes et rend l'index partiel lisible.
 */
alter table public.analyses drop constraint if exists analyses_visitor_identified;
alter table public.analyses
    add constraint analyses_visitor_identified
    check (user_id is not null or visitor_hash is not null)
    not valid;   -- `not valid` : les lignes déjà présentes ne sont pas rejetées

create index if not exists idx_analyses_visitor_hash
    on public.analyses(visitor_hash, created_at desc)
    where user_id is null;

create index if not exists idx_analyses_anonymous
    on public.analyses(created_at desc)
    where user_id is null;

-- ----------------------------------------------------------------------------
-- 2. Même traçabilité dans la piste d'audit.
--    `ip_address` et `user_agent` existaient déjà mais n'étaient jamais
--    renseignés ; on y ajoute l'empreinte visiteur pour pouvoir relier un
--    événement anonyme à ses analyses.
-- ----------------------------------------------------------------------------
alter table public.activity_logs add column if not exists visitor_hash text;

create index if not exists idx_activity_logs_visitor_hash
    on public.activity_logs(visitor_hash)
    where visitor_hash is not null;

-- ----------------------------------------------------------------------------
-- 3. Réglages associés.
-- ----------------------------------------------------------------------------
insert into public.system_settings (key, value, description, category, value_type, is_public) values
    ('log_anonymous_analyses',  'true', 'Enregistrer les analyses des visiteurs non connectés',          'security', 'boolean', true),
    ('anonymous_retention_days','90',   'Suppression automatique des analyses anonymes après N jours (0 = jamais)', 'limits', 'number', false)
on conflict (key) do update set
    description = excluded.description,
    category    = excluded.category,
    value_type  = excluded.value_type,
    is_public   = excluded.is_public;

-- ----------------------------------------------------------------------------
-- 4. Quota anonyme calculé en base.
--    Remplace le compteur mémoire : survit à un redémarrage et reste cohérent
--    entre plusieurs instances de l'API.
-- ----------------------------------------------------------------------------
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

-- Appelée uniquement par l'API avec la clé service_role.
revoke execute on function public.visitor_usage_today(text) from public;
revoke execute on function public.visitor_usage_today(text) from anon, authenticated;
grant  execute on function public.visitor_usage_today(text) to   service_role;

-- ----------------------------------------------------------------------------
-- 5. Liste des analyses : filtre par public et exposition de l'identité
--    visiteur. La signature gagne `p_audience`, en dernier paramètre avec une
--    valeur par défaut, pour ne pas casser les appels existants.
-- ----------------------------------------------------------------------------
drop function if exists public.admin_list_analyses(text, text, text, integer, integer);

create or replace function public.admin_list_analyses(
    p_search   text    default null,
    p_type     text    default null,
    p_status   text    default null,   -- 'active' | 'removed'
    p_limit    integer default 50,
    p_offset   integer default 0,
    p_audience text    default null    -- 'members' | 'visitors'
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

-- ----------------------------------------------------------------------------
-- 6. Statistiques : séparer membres et visiteurs.
--    Les totaux existants restent inchangés pour ne pas fausser les
--    comparaisons historiques ; un bloc `visitors` vient s'y ajouter, et la
--    série temporelle distingue désormais les deux publics.
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

    -- Volume jour par jour, membres contre visiteurs.
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

    /*
     * Visiteurs les plus actifs des dernières 24 h : sert à repérer un abus
     * (script qui martèle l'API) que les totaux agrégés masquent.
     */
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
-- 7. Purge des analyses anonymes au-delà de la durée de conservation.
--    Conserver indéfiniment des données de visiteurs n'a pas d'intérêt et
--    alourdit la base ; le super admin fixe le délai.
-- ----------------------------------------------------------------------------
create or replace function public.admin_purge_anonymous_analyses(p_days integer default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_days    integer;
    v_deleted integer;
begin
    perform public.require_super_admin();

    v_days := coalesce(
        p_days,
        nullif(public.setting('anonymous_retention_days'), '')::integer,
        90
    );

    if v_days <= 0 then
        raise exception 'DUREE_INVALIDE: indiquez un nombre de jours strictement positif.';
    end if;

    delete from public.analyses
     where user_id is null
       and created_at < now() - (v_days || ' days')::interval;

    get diagnostics v_deleted = row_count;

    perform public.write_audit(
        'ADMIN_ANONYMOUS_PURGED',
        jsonb_build_object('days', v_days, 'deleted', v_deleted),
        null,
        'warning'
    );

    return v_deleted;
end;
$$;

grant execute on function public.admin_purge_anonymous_analyses(integer) to authenticated;

-- ----------------------------------------------------------------------------
-- 8. Vérification visible dans la sortie du SQL Editor.
-- ----------------------------------------------------------------------------
do $$
declare
    v_anon integer;
begin
    select count(*) into v_anon from public.analyses where user_id is null;
    raise notice 'Analyses anonymes actuellement enregistrées : %', v_anon;
    raise notice 'Colonnes visiteur et RPC admin_visitor_stats() en place.';
end;
$$;
