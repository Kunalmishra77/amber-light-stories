-- Production-readiness hardening: privilege escalation, integrity bypass, and
-- cross-tenant reads found by the M1-M15 audit.
--
-- The headline defect (P0): RLS is ROW-level. `profiles_self` correctly limits a
-- user to their own row, but the `authenticated` role held table-wide UPDATE on
-- `profiles`, so any signed-in user could run
--     update profiles set is_super_admin = true where user_id = auth.uid();
-- `is_super_admin()` reads that column, and every RLS policy in the database
-- trusts `is_super_admin()`. One UPDATE therefore granted full read/write across
-- every tenant. Verified exploitable against the live database before this fix.
--
-- Row-level policies cannot restrict WHICH COLUMNS are written, so the fix uses
-- the two mechanisms that can: column-level privileges, and triggers.

-- ============ P0: no self-promotion to platform super admin ============
-- Authoritative guard. Covers INSERT and UPDATE through every client, including
-- any future code path or a direct PostgREST call.
create or replace function public.enforce_profile_privilege()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_caller_is_admin boolean;
begin
  -- The service role and direct server-side connections (no JWT) are trusted:
  -- that is how onboarding provisions an admin and how the lockout worker
  -- updates failed_login_attempts.
  if auth.uid() is null or current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  select coalesce((select is_super_admin from profiles where user_id = auth.uid()), false)
    into v_caller_is_admin;
  if v_caller_is_admin then
    return new;                                   -- an existing admin may manage admins
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.is_super_admin, false) then
      raise exception 'profiles: only a platform admin can create a platform admin'
        using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

  if new.is_super_admin is distinct from old.is_super_admin then
    raise exception 'profiles: is_super_admin can only be changed by a platform admin'
      using errcode = 'insufficient_privilege';
  end if;
  -- Lockout state is set by the auth worker, never by the account itself.
  if new.failed_login_attempts is distinct from old.failed_login_attempts
     or new.locked_until is distinct from old.locked_until then
    raise exception 'profiles: lockout state is managed by the server'
      using errcode = 'insufficient_privilege';
  end if;
  if new.user_id is distinct from old.user_id then
    raise exception 'profiles: user_id is immutable' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profile_privilege on profiles;
create trigger trg_profile_privilege
  before insert or update on profiles
  for each row execute function public.enforce_profile_privilege();

-- Defence in depth: a tenant user has no business writing these columns at all.
revoke update on profiles from authenticated;
grant update (full_name, avatar, must_change_password, password_changed_at)
  on profiles to authenticated;

-- `anon` is pre-authentication. It never legitimately writes application data.
revoke insert, update, delete, truncate on profiles from anon;

-- ============ P1: version history must not be forgeable ============
-- Every "immutable version" trigger checked the WATCHED columns only while
-- old.immutable was true. Nothing stopped `update ... set immutable = false`
-- first, and then rewriting history on a second statement. Clearing the flag is
-- now itself a violation: immutability is one-way.
create or replace function public.enforce_immutable_flag()
returns trigger language plpgsql as $$
begin
  if old.immutable and not coalesce(new.immutable, false) then
    raise exception '%: immutability cannot be revoked once a version is sealed', tg_table_name
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'stage_versions', 'asset_versions', 'ops_playbook_versions',
    'config_versions', 'approval_policy_versions', 'security_policy_versions',
    'character_versions'
  ] loop
    if to_regclass('public.' || t) is not null
       and exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = t and column_name = 'immutable') then
      execute format('drop trigger if exists trg_%s_immutable_flag on %I', t, t);
      execute format(
        'create trigger trg_%s_immutable_flag before update on %I
           for each row execute function public.enforce_immutable_flag()', t, t);
      execute format('revoke update (immutable) on %I from authenticated', t);
    end if;
  end loop;
end $$;

-- ============ P1: a tenant must not upgrade its own plan ============
-- `subscriptions` had one FOR ALL policy, so a member could raise their own
-- plan_id and grant themselves another plan's quotas. Reads stay tenant-scoped;
-- writes become platform-only, which is what assignPlanAction already does.
drop policy if exists tenant_isolation on subscriptions;
create policy subscriptions_read on subscriptions for select
  using (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()));
create policy subscriptions_admin_write on subscriptions for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- ============ P1: API key governance columns are server-managed ============
-- Every legitimate write already goes through the service-role client, so
-- removing these grants changes no working flow. Without this a member could
-- clear `revoked_at` on a revoked key, widen `scopes`, drop `ip_allowlist`, or
-- turn off `require_signature`.
revoke update (key_hash, scopes, revoked_at, expires_at, ip_allowlist,
               require_signature, rate_limit_per_min, signing_secret, tenant_id)
  on api_keys from authenticated;

-- ============ P1: cross-tenant reads via unscoped child tables ============
-- These child tables carry no tenant_id of their own and were left readable by
-- every authenticated user (`USING true`), leaking their parent's tenant data.
-- `security_policy_versions` already used the parent-join pattern; the rest now
-- match it.
drop policy if exists read_auth on approval_chain_steps;
create policy approval_chain_steps_read on approval_chain_steps for select
  using (public.is_super_admin() or chain_id in (
    select id from approval_chains where tenant_id in (select public.my_tenant_ids())));

drop policy if exists read_auth on approval_chain_votes;
create policy approval_chain_votes_read on approval_chain_votes for select
  using (public.is_super_admin() or instance_id in (
    select id from approval_chain_instances where tenant_id in (select public.my_tenant_ids())));

drop policy if exists approval_policy_versions_read on approval_policy_versions;
create policy approval_policy_versions_read on approval_policy_versions for select
  using (public.is_super_admin() or policy_id in (
    select id from approval_policies
     where scope_type = 'platform'
        or (scope_type = 'tenant' and scope_id in (select public.my_tenant_ids()))));

drop policy if exists config_versions_read on config_versions;
create policy config_versions_read on config_versions for select
  using (public.is_super_admin() or entry_id in (
    select id from config_entries
     where scope_type = 'platform'
        or (scope_type = 'tenant' and scope_id in (select public.my_tenant_ids()))));

drop policy if exists read_all_auth on permission_group_items;
create policy permission_group_items_read on permission_group_items for select
  using (public.is_super_admin() or group_id in (
    select id from permission_groups
     where tenant_id is null or tenant_id in (select public.my_tenant_ids())));

drop policy if exists read_all_auth on custom_role_permissions;
create policy custom_role_permissions_read on custom_role_permissions for select
  using (public.is_super_admin() or custom_role_id in (
    select id from custom_roles
     where tenant_id is null or tenant_id in (select public.my_tenant_ids())));

-- Platform retention runs are operational data about the platform itself;
-- tenants have no use for them and they reveal platform-wide activity.
drop policy if exists read_all_auth on retention_runs;
create policy retention_runs_admin on retention_runs for all
  using (public.is_super_admin()) with check (public.is_super_admin());

-- ============ P2: index every tenant_id used by RLS ============
-- Every tenant-scoped query filters on tenant_id (RLS adds it even when the
-- caller does not), so an unindexed tenant_id means a sequential scan on every
-- read. Cheap now, and the first thing that would degrade under real volume.
do $$
declare r record;
begin
  for r in
    select c.relname as t
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and exists (select 1 from information_schema.columns col
                  where col.table_schema = 'public' and col.table_name = c.relname
                    and col.column_name = 'tenant_id')
      and not exists (
        select 1 from pg_index i
        join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
        where i.indrelid = c.oid and a.attname = 'tenant_id')
  loop
    execute format('create index if not exists idx_%s_tenant on %I (tenant_id)', r.t, r.t);
  end loop;
end $$;
