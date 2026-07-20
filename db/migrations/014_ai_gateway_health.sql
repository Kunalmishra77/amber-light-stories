-- M8 / P2-06: AI Gateway — provider health monitoring hook backing store.
-- One row per (provider, scope): tenant_id NULL = platform-wide health.
-- Cost tracking reuses the existing `api_usage` table (no new cost table).
-- Health is WRITTEN by the gateway via the service-role client (no auth.uid()
-- in the execution path); RLS below only governs authed-session READs.

create table if not exists provider_health (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  tenant_id uuid references tenants(id) on delete cascade,  -- NULL = platform-wide
  status text not null default 'unknown',                   -- healthy|degraded|down|unknown
  consecutive_failures int not null default 0,
  last_ok_at timestamptz,
  last_error_at timestamptz,
  last_error text,
  checked_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- One platform-wide row per provider, and one row per (provider, tenant).
create unique index if not exists uq_provider_health_platform
  on provider_health (provider) where tenant_id is null;
create unique index if not exists uq_provider_health_tenant
  on provider_health (provider, tenant_id) where tenant_id is not null;

alter table provider_health enable row level security;
drop policy if exists provider_health_read on provider_health;
create policy provider_health_read on provider_health for select to authenticated
  using (public.is_super_admin() or tenant_id is null or tenant_id in (select public.my_tenant_ids()));
