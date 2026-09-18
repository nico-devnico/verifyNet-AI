-- ============================================================================
-- VerifyNet — 0007_fix_admin_list_users.sql
-- ----------------------------------------------------------------------------
-- Corrige l'erreur PostgreSQL :
--   « structure of query does not match function result type »
--
-- Cause : CREATE OR REPLACE ne change pas le type de retour d'une fonction
-- déjà déployée (ex. colonne has_auth_account ajoutée puis retirée), et les
-- colonnes de profiles peuvent être varchar alors que RETURNS TABLE attend
-- text. RETURN QUERY est strict : chaque colonne doit matcher exactement.
--
-- Idempotent. Dépend de : 0001, 0002.
-- ============================================================================

set search_path = public;

-- Supprime toutes les surcharges éventuelles de admin_list_users.
do $$
declare
    r record;
begin
    for r in
        select p.oid::regprocedure as sig
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname = 'admin_list_users'
    loop
        execute format('drop function if exists %s', r.sig);
    end loop;
end;
$$;

create or replace function public.admin_list_users(
    p_search text    default null,
    p_role   text    default null,
    p_status text    default null,
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
        select p.id,
               p.email::text              as email,
               p.role::text               as role,
               p.username::text           as username,
               p.first_name::text         as first_name,
               p.last_name::text          as last_name,
               p.avatar_url::text         as avatar_url,
               coalesce(p.is_verified, false)  as is_verified,
               coalesce(p.is_suspended, false) as is_suspended,
               p.suspended_at,
               p.suspension_reason::text  as suspension_reason,
               p.daily_quota_override,
               p.last_seen_at,
               p.created_at
          from public.profiles p
         where (p_search is null or p_search = ''
                or p.email      ilike '%' || p_search || '%'
                or p.username   ilike '%' || p_search || '%'
                or p.first_name ilike '%' || p_search || '%'
                or p.last_name  ilike '%' || p_search || '%')
           and (p_role   is null or p_role   = '' or p.role = p_role)
           and (p_status is null or p_status = ''
                or (p_status = 'suspended' and coalesce(p.is_suspended, false))
                or (p_status = 'active'    and not coalesce(p.is_suspended, false)))
    )
    select f.id,
           f.email,
           f.role,
           f.username,
           f.first_name,
           f.last_name,
           f.avatar_url,
           f.is_verified,
           f.is_suspended,
           f.suspended_at,
           f.suspension_reason,
           f.daily_quota_override,
           f.last_seen_at,
           f.created_at,
           coalesce(a.total, 0)::bigint as analyses_count,
           coalesce(a.today, 0)::bigint as analyses_today,
           (lower(f.email) = lower(public.root_super_admin_email())) as is_root,
           (select count(*)::bigint from filtered) as total_count
      from filtered f
      left join (
            select an.user_id,
                   count(*)::bigint as total,
                   count(*) filter (
                     where an.created_at >= date_trunc('day', now())
                   )::bigint as today
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

grant execute on function public.admin_list_users(text, text, text, integer, integer)
    to authenticated;

notify pgrst, 'reload schema';

do $$
begin
    raise notice '0007 : admin_list_users() corrigée (types alignés, surcharge nettoyée).';
end;
$$;
