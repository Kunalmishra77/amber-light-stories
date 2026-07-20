-- M8 / P2-12: Public API & Webhooks.
-- Tenant-scoped, provider-independent foundation:
--   * api_keys           — scoped, hashed keys (issue/rotate/revoke)
--   * webhook_endpoints  — per-tenant signed webhook destinations
--   * webhook_deliveries — outbound dispatch log (status/attempts/signature)
--   * api_request_log    — per-request log backing rate-limit + observability
-- RLS mirrors the standard tenant_isolation policy (is_super_admin OR member).
-- The public API itself authenticates by API KEY via the service-role client
-- (no auth.uid()); RLS here protects the dashboard/console authed-session path.

create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  prefix text not null unique,                 -- public id, e.g. ak_live_ab12cd34 (shown in UI, used for fast lookup)
  key_hash text not null,                      -- sha256 hex of the full token; the raw token is shown ONCE
  scopes text[] not null default '{}',         -- e.g. {read, stories:read} or {*}
  rate_limit_per_min int not null default 60,  -- rate-limit hook ceiling
  last_used_at timestamptz,
  revoked_at timestamptz,
  rotated_at timestamptz,
  created_by uuid,
  created_at timestamptz default now()
);
create index if not exists idx_api_keys_tenant on api_keys (tenant_id);

create table if not exists webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  url text not null,
  signing_secret text not null,                -- whsec_<hex>; used to HMAC-sign outbound payloads
  event_types text[] not null default '{}',    -- subscribed events, or {*} for all
  enabled boolean not null default true,
  description text,
  created_by uuid,
  created_at timestamptz default now()
);
create index if not exists idx_webhook_endpoints_tenant on webhook_endpoints (tenant_id);

create table if not exists webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  endpoint_id uuid references webhook_endpoints(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}',
  status text not null default 'pending',      -- pending|success|failed
  status_code int,
  attempts int not null default 0,
  error text,
  signature text,
  created_at timestamptz default now(),
  delivered_at timestamptz
);
create index if not exists idx_webhook_deliveries_tenant_created on webhook_deliveries (tenant_id, created_at desc);
create index if not exists idx_webhook_deliveries_endpoint on webhook_deliveries (endpoint_id);

create table if not exists api_request_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  api_key_id uuid references api_keys(id) on delete cascade,
  method text,
  path text,
  status int,
  created_at timestamptz default now()
);
create index if not exists idx_api_request_log_key_created on api_request_log (api_key_id, created_at desc);

-- Standard tenant-isolation RLS (identical shape to migration 004).
do $$
declare t text;
begin
  foreach t in array array['api_keys','webhook_endpoints','webhook_deliveries','api_request_log'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format($f$create policy tenant_isolation on %I for all to authenticated
      using (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()))
      with check (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()))$f$, t);
  end loop;
end $$;
