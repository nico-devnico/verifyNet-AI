-- ============================================================================
-- VerifyNet — 0006_admin_account_sync.sql
-- ----------------------------------------------------------------------------
-- Aligne public.profiles sur auth.users, ce qui corrige trois symptômes de
-- la console super admin :
--
--   1. Suppression sans effet
--      deleteUser() retirait la ligne de auth.users, mais le profil restait
--      si la FK ON DELETE CASCADE n'avait jamais été posée (CREATE TABLE IF
--      NOT EXISTS d'un ancien schéma). L'UI relit profiles → le compte
--      réapparaît, alors qu'il a disparu d'Authentication.
--
--   2. Changement d'email sans effet
--      L'API Auth mettait à jour auth.users, mais handle_user_email_change()
--      pouvait manquer. L'UI affiche profiles.email → l'ancienne adresse.
--
--   3. Comptes visibles dans l'UI, absents de Supabase Auth
--      Anciens INSERT de démo (test.admin@exemple.com, …) et profils restés
--      après une suppression Auth. On les retire, on recrée les profils
--      manquants, et on pose enfin la cascade.
--
-- Idempotent. Dépend de : 0001_core_schema.sql, 0002_admin_rpc.sql.
-- ============================================================================

set search_path = public;

-- ----------------------------------------------------------------------------
-- 1. Ancien trigger qui pouvait bloquer DELETE / UPDATE d'email.
-- ----------------------------------------------------------------------------
drop trigger if exists protect_super_admin_trigger on public.profiles;

-- ----------------------------------------------------------------------------
-- 2. Profils orphelins : présents dans public.profiles, absents de auth.users.
--    D'abord les lignes qui les référencent, puis le profil lui-même.
--    (La contrainte analyses_visitor_identified interdit un user_id nul
--    sans visitor_hash : on supprime plutôt que de détacher.)
-- ----------------------------------------------------------------------------
delete from public.analyses a
 where a.user_id is not null
   and not exists (select 1 from auth.users u where u.id = a.user_id);

delete from public.notifications n
 where not exists (select 1 from auth.users u where u.id = n.user_id);

delete from public.user_preferences up
 where not exists (select 1 from auth.users u where u.id = up.user_id);

delete from public.profiles p
 where not exists (select 1 from auth.users u where u.id = p.id);

-- ----------------------------------------------------------------------------
-- 3. Email du profil = email d'authentification (après nettoyage, pour
--    éviter un conflit d'unicité avec un orphelin).
-- ----------------------------------------------------------------------------
update public.profiles p
   set email = u.email
  from auth.users u
 where p.id = u.id
   and u.email is not null
   and p.email is distinct from u.email;

-- ----------------------------------------------------------------------------
-- 4. Comptes Auth sans profil (inscription avant le trigger, ou profil
--    perdu). Même logique que le rattrapage de 0001.
-- ----------------------------------------------------------------------------
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
on conflict (id) do update set
    email = excluded.email;

insert into public.user_preferences (user_id)
select p.id from public.profiles p
  left join public.user_preferences up on up.user_id = p.id
 where up.user_id is null
on conflict (user_id) do nothing;

-- ----------------------------------------------------------------------------
-- 5. FK profiles.id → auth.users(id) ON DELETE CASCADE.
--    CREATE TABLE IF NOT EXISTS de 0001 ne l'ajoute pas si la table existait
--    déjà sans cette contrainte.
-- ----------------------------------------------------------------------------
do $$
declare
    v_con text;
begin
    select c.conname into v_con
      from pg_constraint c
      join pg_class src       on src.oid = c.conrelid
      join pg_namespace ns    on ns.oid  = src.relnamespace
      join pg_class dst       on dst.oid = c.confrelid
      join pg_namespace dns   on dns.oid = dst.relnamespace
     where ns.nspname  = 'public'
       and src.relname = 'profiles'
       and dns.nspname = 'auth'
       and dst.relname = 'users'
       and c.contype   = 'f'
     limit 1;

    if v_con is not null then
        execute format('alter table public.profiles drop constraint %I', v_con);
    end if;

    alter table public.profiles
        add constraint profiles_id_fkey
        foreign key (id) references auth.users(id) on delete cascade;
exception when others then
    raise notice 'FK profiles.id → auth.users non posée : %', sqlerrm;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. Trigger de synchro d'email (recréation défensive si 0001 n'a pas été
--    rejoué après une restauration).
-- ----------------------------------------------------------------------------
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if new.email is distinct from old.email and new.email is not null then
        update public.profiles
           set email = new.email,
               is_verified = case
                   when new.email_confirmed_at is not null then true
                   else is_verified
               end
         where id = new.id;
    elsif new.email_confirmed_at is not null and old.email_confirmed_at is null then
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
-- 7. Liste admin : lecture directe de public.profiles (rapide, sans join
--    auth.users — ce schéma n'est pas toujours visible selon le propriétaire
--    de la fonction, ce qui vidait la liste). L'email Auth est fusionné
--    ensuite par l'API. DROP obligatoire si la signature a déjà changé.
-- ----------------------------------------------------------------------------
-- DROP obligatoire : CREATE OR REPLACE ne change pas le RETURNS TABLE
-- (sinon « structure of query does not match function result type »).
drop function if exists public.admin_list_users(text, text, text, integer, integer);

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

-- ----------------------------------------------------------------------------
-- 8. Santé des comptes (diagnostics) + purge explicite des orphelins.
-- ----------------------------------------------------------------------------
create or replace function public.admin_account_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
    v_profiles integer;
    v_auth     integer;
    v_orphans  integer;
    v_missing  integer;
    v_email    integer;
begin
    if auth.role() is distinct from 'service_role' then
        perform public.require_admin();
    end if;

    select count(*) into v_profiles from public.profiles;
    select count(*) into v_auth from auth.users;

    select count(*) into v_orphans
      from public.profiles p
     where not exists (select 1 from auth.users u where u.id = p.id);

    select count(*) into v_missing
      from auth.users u
     where u.email is not null
       and not exists (select 1 from public.profiles p where p.id = u.id);

    select count(*) into v_email
      from public.profiles p
      join auth.users u on u.id = p.id
     where u.email is not null
       and p.email is distinct from u.email;

    return jsonb_build_object(
        'profiles',          v_profiles,
        'auth_users',        v_auth,
        'orphan_profiles',   v_orphans,
        'missing_profiles',  v_missing,
        'email_mismatches',  v_email
    );
end;
$$;

grant execute on function public.admin_account_health() to authenticated;
grant execute on function public.admin_account_health() to service_role;

create or replace function public.admin_purge_orphan_profiles()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_count integer := 0;
begin
    perform public.require_super_admin();

    delete from public.analyses a
     where a.user_id is not null
       and not exists (select 1 from auth.users u where u.id = a.user_id);

    delete from public.notifications n
     where not exists (select 1 from auth.users u where u.id = n.user_id);

    delete from public.user_preferences up
     where not exists (select 1 from auth.users u where u.id = up.user_id);

    delete from public.profiles p
     where not exists (select 1 from auth.users u where u.id = p.id)
       and (public.root_super_admin_email() = ''
            or lower(p.email) is distinct from lower(public.root_super_admin_email()));

    get diagnostics v_count = row_count;

    perform public.write_audit(
        'ADMIN_ORPHAN_PROFILES_PURGED',
        jsonb_build_object('deleted', v_count),
        null,
        'critical'
    );

    return v_count;
end;
$$;

grant execute on function public.admin_purge_orphan_profiles() to authenticated;

notify pgrst, 'reload schema';

do $$
begin
    raise notice '0006 : profiles aligné sur auth.users, cascade ON DELETE, emails synchronisés.';
end;
$$;
