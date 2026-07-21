-- M13 S1: central, versioned Security Policy Engine (ADR-056) + Zero-Trust
-- inputs (ADR-055) + the remaining API security controls (P7-06).
--
-- Policies are VERSIONED with exactly ONE active version per (scope, type) —
-- the same governance shape M12 proved for assets. Inheritance is evaluated in
-- code as TIGHTEN-ONLY: platform default -> organization -> workspace, where a
-- narrower scope may only make a policy stricter, never weaker.

create table if not exists security_policies (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null,                 -- platform|organization|tenant
  scope_id uuid,                            -- NULL for platform
  policy_type text not null,                -- password|mfa|session|login|ip|device|api|secret|data_access
  active_version_id uuid,
  created_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint security_policies_scope_check check (
    (scope_type = 'platform' and scope_id is null) or
    (scope_type in ('organization','tenant') and scope_id is not null)
  )
);
create unique index if not exists uq_security_policies_platform
  on security_policies (policy_type) where scope_type = 'platform';
create unique index if not exists uq_security_policies_scoped
  on security_policies (scope_type, scope_id, policy_type) where scope_id is not null;

create table if not exists security_policy_versions (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references security_policies(id) on delete cascade,
  version int not null,
  body jsonb not null default '{}',
  state text not null default 'draft',      -- draft|active|archived
  immutable boolean not null default false,
  notes text,
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz default now()
);
create unique index if not exists uq_policy_versions on security_policy_versions (policy_id, version);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'security_policies_active_fk') then
    alter table security_policies
      add constraint security_policies_active_fk
      foreign key (active_version_id) references security_policy_versions(id) on delete set null;
  end if;
end $$;

-- Policy versions are immutable once activated (same guarantee as M12 assets).
create or replace function public.enforce_policy_version_immutability()
returns trigger language plpgsql as $$
begin
  if old.immutable and (new.body is distinct from old.body or new.version is distinct from old.version) then
    raise exception 'security_policy_versions %: immutable version cannot be modified', old.id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_policy_version_immutability on security_policy_versions;
create trigger trg_policy_version_immutability
  before update on security_policy_versions
  for each row execute function public.enforce_policy_version_immutability();

-- Policies are readable by the scopes they govern; only super admins write.
alter table security_policies enable row level security;
drop policy if exists security_policies_read on security_policies;
create policy security_policies_read on security_policies for select to authenticated
  using (
    public.is_super_admin()
    or scope_type = 'platform'
    or (scope_type = 'tenant' and scope_id in (select public.my_tenant_ids()))
  );
drop policy if exists security_policies_admin on security_policies;
create policy security_policies_admin on security_policies for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

alter table security_policy_versions enable row level security;
drop policy if exists policy_versions_read on security_policy_versions;
create policy policy_versions_read on security_policy_versions for select to authenticated
  using (
    public.is_super_admin()
    or policy_id in (
      select p.id from security_policies p
      where p.scope_type = 'platform'
         or (p.scope_type = 'tenant' and p.scope_id in (select public.my_tenant_ids()))
    )
  );
drop policy if exists policy_versions_admin on security_policy_versions;
create policy policy_versions_admin on security_policy_versions for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- ---- Platform baseline policies (the floor tenants may only tighten) ----
do $$
declare pid uuid; vid uuid;
begin
  foreach pid in array array[null::uuid] loop null; end loop;  -- no-op guard
  -- password
  if not exists (select 1 from security_policies where scope_type='platform' and policy_type='password') then
    insert into security_policies(scope_type, policy_type) values ('platform','password') returning id into pid;
    insert into security_policy_versions(policy_id, version, body, state, immutable, notes)
    values (pid, 1, '{"min_length":12,"require_number":true,"require_symbol":false,"max_age_days":365}'::jsonb,
            'active', true, 'Platform baseline') returning id into vid;
    update security_policies set active_version_id = vid where id = pid;
  end if;
  -- mfa
  if not exists (select 1 from security_policies where scope_type='platform' and policy_type='mfa') then
    insert into security_policies(scope_type, policy_type) values ('platform','mfa') returning id into pid;
    insert into security_policy_versions(policy_id, version, body, state, immutable, notes)
    values (pid, 1, '{"required":false,"required_for_roles":["super_admin"],"step_up_actions":["credentials.update","queue.redrive_job","break_glass.request"]}'::jsonb,
            'active', true, 'Platform baseline') returning id into vid;
    update security_policies set active_version_id = vid where id = pid;
  end if;
  -- session
  if not exists (select 1 from security_policies where scope_type='platform' and policy_type='session') then
    insert into security_policies(scope_type, policy_type) values ('platform','session') returning id into pid;
    insert into security_policy_versions(policy_id, version, body, state, immutable, notes)
    values (pid, 1, '{"max_idle_minutes":10080,"max_concurrent_sessions":10,"revoke_on_risk":true}'::jsonb,
            'active', true, 'Platform baseline') returning id into vid;
    update security_policies set active_version_id = vid where id = pid;
  end if;
  -- login (risk / lockout)
  if not exists (select 1 from security_policies where scope_type='platform' and policy_type='login') then
    insert into security_policies(scope_type, policy_type) values ('platform','login') returning id into pid;
    insert into security_policy_versions(policy_id, version, body, state, immutable, notes)
    values (pid, 1, '{"max_failed_attempts":10,"lockout_minutes":15,"step_up_on_new_device":true,"step_up_on_new_ip":false}'::jsonb,
            'active', true, 'Platform baseline') returning id into vid;
    update security_policies set active_version_id = vid where id = pid;
  end if;
  -- api
  if not exists (select 1 from security_policies where scope_type='platform' and policy_type='api') then
    insert into security_policies(scope_type, policy_type) values ('platform','api') returning id into pid;
    insert into security_policy_versions(policy_id, version, body, state, immutable, notes)
    values (pid, 1, '{"require_signature":false,"max_key_age_days":365,"enforce_ip_allowlist":true,"max_clock_skew_seconds":300}'::jsonb,
            'active', true, 'Platform baseline') returning id into vid;
    update security_policies set active_version_id = vid where id = pid;
  end if;
end $$;

-- ---- P7-06 remainder: key expiry, IP allowlists, inbound request signing ----
alter table api_keys add column if not exists expires_at timestamptz;
alter table api_keys add column if not exists ip_allowlist text[] not null default '{}';  -- CIDR/IP strings; empty = any
alter table api_keys add column if not exists signing_secret text;                        -- inbound HMAC verification
alter table api_keys add column if not exists require_signature boolean not null default false;
