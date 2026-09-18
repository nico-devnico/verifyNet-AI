-- ============================================================================
-- VerifyNet — 0003_audit_hardening.sql
-- ----------------------------------------------------------------------------
-- Scelle la piste d'audit.
--
-- 0001 autorisait un utilisateur à insérer dans `activity_logs` sous sa propre
-- identité. Cela empêchait bien l'usurpation, mais laissait n'importe quel
-- compte polluer le journal : `action` et `details` sont libres, et `severity`
-- pouvait être forcé à 'critical'. Un journal d'audit dans lequel le sujet
-- surveillé peut écrire ne sert plus à surveiller.
--
-- Désormais aucune écriture directe n'est possible depuis le client. Les seules
-- voies d'écriture sont des fonctions SECURITY DEFINER qui imposent
-- `user_id = auth.uid()` :
--     • public.log_activity()  — appelable par l'utilisateur
--     • public.write_audit()   — réservée aux fonctions admin_*
--     • le trigger handle_new_user() pour l'événement ACCOUNT_CREATED
--
-- Le script est idempotent : il peut être rejoué sans effet de bord.
--
-- Dépend de : 0001_core_schema.sql, 0002_admin_rpc.sql
-- ============================================================================

set search_path = public;

-- ----------------------------------------------------------------------------
-- 1. Plus aucune politique d'écriture pour les rôles clients.
-- ----------------------------------------------------------------------------
drop policy if exists "activity_logs_insert_self"       on public.activity_logs;
drop policy if exists "activity_logs_insert_own"        on public.activity_logs;
drop policy if exists "activity_logs_insert_any"        on public.activity_logs;
drop policy if exists "Users can insert activity logs"  on public.activity_logs;

-- La lecture reste ouverte à l'intéressé et aux administrateurs.
drop policy if exists "activity_logs_select_own_or_admin" on public.activity_logs;
create policy "activity_logs_select_own_or_admin" on public.activity_logs
    for select using (auth.uid() = user_id or public.is_admin());

-- ----------------------------------------------------------------------------
-- 2. Retrait des privilèges de table.
--    RLS seule ne suffit pas : sans politique d'insertion l'écriture échoue
--    déjà, mais retirer le privilège rend l'intention explicite et protège
--    contre l'ajout accidentel d'une politique permissive plus tard.
--    La purge passe par admin_purge_activity_logs(), en SECURITY DEFINER.
-- ----------------------------------------------------------------------------
revoke insert, update, delete on public.activity_logs from anon, authenticated;
grant  select                 on public.activity_logs to   authenticated;

-- ----------------------------------------------------------------------------
-- 2 bis. write_audit() n'est pas appelable depuis le client.
--
--   PostgreSQL accorde EXECUTE à PUBLIC sur toute fonction nouvellement créée,
--   et les rôles `anon` / `authenticated` héritent des privilèges de PUBLIC.
--   Le `revoke ... from anon, authenticated` de 0002 était donc sans effet :
--   n'importe quel compte connecté pouvait encore appeler write_audit() et
--   fabriquer une entrée d'audit visant un autre utilisateur, en gravité
--   'critical'. On retire le privilège à PUBLIC, source réelle du droit.
--
--   Les fonctions admin_* continuent d'appeler write_audit() sans problème :
--   elles sont SECURITY DEFINER et s'exécutent donc avec les droits du
--   propriétaire, pas ceux de l'appelant.
-- ----------------------------------------------------------------------------
revoke execute on function public.write_audit(text, jsonb, uuid, text) from public;
revoke execute on function public.write_audit(text, jsonb, uuid, text) from anon, authenticated;

-- log_activity() reste ouverte : elle force user_id = auth.uid() et n'accepte
-- ni cible ni gravité 'critical' arbitraire.
grant execute on function public.log_activity(text, jsonb, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Filet de sécurité côté base.
--    Si une future politique rouvrait l'insertion, ce trigger garantit qu'une
--    ligne ne peut pas être attribuée à quelqu'un d'autre, ni marquée
--    'critical' par un compte non administrateur.
-- ----------------------------------------------------------------------------
create or replace function public.guard_activity_log_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    -- Les appels serveur (service_role) et les fonctions SECURITY DEFINER
    -- exécutées hors session utilisateur conservent tous les droits.
    if auth.uid() is null then
        return new;
    end if;

    if new.user_id is distinct from auth.uid() and not public.is_admin() then
        raise exception 'AUDIT_PROTEGE: une entrée d''audit ne peut pas être attribuée à un autre compte.'
            using errcode = '42501';
    end if;

    if new.severity = 'critical' and not public.is_admin() then
        new.severity := 'info';
    end if;

    return new;
end;
$$;

drop trigger if exists guard_activity_logs_insert on public.activity_logs;
create trigger guard_activity_logs_insert
    before insert on public.activity_logs
    for each row execute function public.guard_activity_log_insert();

-- ----------------------------------------------------------------------------
-- 4. Sonde de diagnostic, lue par /api/admin/diagnostics et affichée dans la
--    console super admin. Renvoie le nombre de politiques d'écriture encore
--    présentes sur activity_logs : la valeur attendue est 0.
-- ----------------------------------------------------------------------------
create or replace function public.audit_write_policy_count()
returns integer
language sql
stable
security definer
set search_path = public, pg_catalog, pg_temp
as $$
    select count(*)::integer
      from pg_policies
     where schemaname = 'public'
       and tablename  = 'activity_logs'
       and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL');
$$;

-- Réservée au service_role : le privilège EXECUTE par défaut va à PUBLIC,
-- c'est donc bien à PUBLIC qu'il faut le retirer.
revoke execute on function public.audit_write_policy_count() from public;
revoke execute on function public.audit_write_policy_count() from anon, authenticated;
grant  execute on function public.audit_write_policy_count() to   service_role;

-- ----------------------------------------------------------------------------
-- 5. Vérification immédiate, visible dans la sortie du SQL Editor.
-- ----------------------------------------------------------------------------
do $$
declare
    v_write_policies integer;
begin
    select count(*) into v_write_policies
      from pg_policies
     where schemaname = 'public'
       and tablename  = 'activity_logs'
       and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL');

    if v_write_policies > 0 then
        raise warning 'activity_logs : % politique(s) d''écriture subsistent.', v_write_policies;
    else
        raise notice 'activity_logs scellé : écriture uniquement via log_activity() et write_audit().';
    end if;
end;
$$;
