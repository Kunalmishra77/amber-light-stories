-- M13 S2: identity planes, service accounts, custom roles, permission groups,
-- time-boxed privileged access (PAM), and an OPTIONAL Organizations tier.
-- ADR-050 (disjoint planes + non-human identities), ADR-051 (PAM), ADR-026.
--
-- *** ORGANIZATIONS ARE STRICTLY ADDITIVE ***
-- `tenants.organization_id` is NULLABLE. A workspace with no organization
-- behaves EXACTLY as it does today. `my_tenant_ids()` is deliberately NOT
-- changed: organization membership grants NO implicit tenant access, so the
-- existing tenant isolation model is preserved bit-for-bit. Organization
-- access is a separate, explicit authorization (`my_org_ids()`), used only by
-- organization-scoped tables.

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  status text not null default 'active',    -- active|suspended|archived
  created_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'org_viewer',  -- org_owner|org_admin|org_viewer
  status text not null default 'active',
  created_at timestamptz default now()
);
create unique index if not exists uq_org_members on organization_members (organization_id, user_id);

-- Optional parent link. NULL = today's standalone workspace (zero behaviour change).
alter table tenants add column if not exists organization_id uuid references organizations(id) on delete set null;
create index if not exists idx_tenants_org on tenants (organization_id);

-- Organizations the caller explicitly belongs to. NOTE: this is intentionally
-- NOT wired into my_tenant_ids() — org membership never implies tenant data
-- access. Cross-tenant reach requires the audited impersonation path (ADR-002).
create or replace function public.my_org_ids() returns setof uuid
  language sql security definer stable set search_path = public as $$
  select organization_id from organization_members
  where user_id = auth.uid() and status = 'active';
$$;

alter table organizations enable row level security;
drop policy if exists organizations_member on organizations;
create policy organizations_member on organizations for select to authenticated
  using (public.is_super_admin() or id in (select public.my_org_ids()));
drop policy if exists organizations_admin on organizations;
create policy organizations_admin on organizations for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

alter table organization_members enable row level security;
drop policy if exists org_members_read on organization_members;
create policy org_members_read on organization_members for select to authenticated
  using (public.is_super_admin() or user_id = auth.uid() or organization_id in (select public.my_org_ids()));
drop policy if exists org_members_admin on organization_members;
create policy org_members_admin on organization_members for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- ---- Non-human identities (ADR-050): service accounts ----
-- API keys (M8) already cover API identities; service accounts are named,
-- scoped machine principals that own automation and can be disabled centrally.
create table if not exists service_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,   -- NULL = platform plane
  plane text not null default 'tenant',                      -- platform|tenant (never bridges)
  name text not null,
  description text,
  scopes text[] not null default '{}',
  status text not null default 'active',                     -- active|disabled
  last_used_at timestamptz,
  created_by uuid,
  created_at timestamptz default now(),
  constraint service_accounts_plane_check check (
    (plane = 'platform' and tenant_id is null) or (plane = 'tenant' and tenant_id is not null)
  )
);
create index if not exists idx_service_accounts_tenant on service_accounts (tenant_id);

alter table service_accounts enable row level security;
drop policy if exists service_accounts_tenant on service_accounts;
create policy service_accounts_tenant on service_accounts for all to authenticated
  using (public.is_super_admin() or (tenant_id is not null and tenant_id in (select public.my_tenant_ids())))
  with check (public.is_super_admin() or (tenant_id is not null and tenant_id in (select public.my_tenant_ids())));

-- ---- Custom roles + permission groups (within a plane, never bridging) ----
create table if not exists custom_roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,   -- NULL = platform-plane role
  plane text not null default 'tenant',
  key text not null,
  label text not null,
  base_role text,                                            -- optional seed from roles.key
  created_by uuid,
  created_at timestamptz default now(),
  constraint custom_roles_plane_check check (
    (plane = 'platform' and tenant_id is null) or (plane = 'tenant' and tenant_id is not null)
  )
);
create unique index if not exists uq_custom_roles_tenant_key on custom_roles (tenant_id, key) where tenant_id is not null;
create unique index if not exists uq_custom_roles_platform_key on custom_roles (key) where tenant_id is null;

create table if not exists custom_role_permissions (
  custom_role_id uuid not null references custom_roles(id) on delete cascade,
  permission_key text not null,
  primary key (custom_role_id, permission_key)
);

create table if not exists permission_groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,   -- NULL = platform-defined group
  key text not null,
  label text not null,
  created_at timestamptz default now()
);
create unique index if not exists uq_permission_groups_tenant_key on permission_groups (tenant_id, key) where tenant_id is not null;
create unique index if not exists uq_permission_groups_platform_key on permission_groups (key) where tenant_id is null;

create table if not exists permission_group_items (
  group_id uuid not null references permission_groups(id) on delete cascade,
  permission_key text not null,
  primary key (group_id, permission_key)
);

do $$
declare t text;
begin
  foreach t in array array['custom_roles','permission_groups'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_or_platform on %I', t);
    execute format($f$create policy tenant_or_platform on %I for all to authenticated
      using (public.is_super_admin() or tenant_id is null or tenant_id in (select public.my_tenant_ids()))
      with check (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()))$f$, t);
  end loop;
  foreach t in array array['custom_role_permissions','permission_group_items'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists read_all_auth on %I', t);
    execute format('create policy read_all_auth on %I for select to authenticated using (true)', t);
    execute format('drop policy if exists admin_write on %I', t);
    execute format('create policy admin_write on %I for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin())', t);
  end loop;
end $$;

-- ---- PAM: approval-based, time-boxed privileged access (ADR-051) ----
create table if not exists privileged_grants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,   -- NULL = platform-plane elevation
  user_id uuid not null,
  permission_key text,                       -- one permission, or…
  role_key text,                             -- …a whole role, for the window
  reason text not null,
  status text not null default 'requested',  -- requested|approved|active|expired|revoked|denied
  requested_by uuid,
  approved_by uuid,                          -- MUST differ from requester (enforced below)
  approved_at timestamptz,
  activated_at timestamptz,
  expires_at timestamptz,                    -- hard stop; auto-expired by an M11 job
  revoked_at timestamptz,
  revoked_by uuid,
  created_at timestamptz default now(),
  constraint privileged_grants_target_check check (permission_key is not null or role_key is not null)
);
create index if not exists idx_privileged_grants_active on privileged_grants (status, expires_at);
create index if not exists idx_privileged_grants_user on privileged_grants (user_id, tenant_id);

-- Separation of duties: a grant can never be self-approved.
create or replace function public.enforce_pam_separation()
returns trigger language plpgsql as $$
begin
  if new.approved_by is not null and new.approved_by = new.requested_by then
    raise exception 'privileged_grants: a request cannot be approved by its requester (separation of duties)'
      using errcode = 'check_violation';
  end if;
  if new.status in ('approved','active') and new.expires_at is null then
    raise exception 'privileged_grants: elevated access must be time-boxed (expires_at required)'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_pam_separation on privileged_grants;
create trigger trg_pam_separation
  before insert or update on privileged_grants
  for each row execute function public.enforce_pam_separation();

alter table privileged_grants enable row level security;
drop policy if exists pam_read on privileged_grants;
create policy pam_read on privileged_grants for select to authenticated
  using (public.is_super_admin() or user_id = auth.uid() or (tenant_id is not null and tenant_id in (select public.my_tenant_ids())));
drop policy if exists pam_admin on privileged_grants;
create policy pam_admin on privileged_grants for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
