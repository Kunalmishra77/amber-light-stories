-- M13 S4: full Vault lifecycle (ADR-054) + KMS key hierarchy (ADR-057).
-- Extends the EXISTING M3 seam (`tenant_credentials` + store_credential/
-- get_credential). Secret VALUES continue to live only in Supabase Vault —
-- nothing here ever stores plaintext. These tables add the lifecycle metadata
-- the seam lacked: versioning, rotation, expiry/health, access policy, usage audit.

alter table tenant_credentials add column if not exists version int not null default 1;
alter table tenant_credentials add column if not exists rotated_at timestamptz;
alter table tenant_credentials add column if not exists expires_at timestamptz;
alter table tenant_credentials add column if not exists health text not null default 'unknown';  -- healthy|expiring|expired|invalid|unknown
alter table tenant_credentials add column if not exists rotation_interval_days int;
alter table tenant_credentials add column if not exists last_used_at timestamptz;

-- Immutable record of each rotation (metadata only — never the secret).
create table if not exists credential_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider text not null,
  version int not null,
  secret_ref text,                 -- Vault reference, NOT the secret
  fingerprint text,                -- sha256 of the secret, for change detection only
  status text not null default 'active',   -- active|superseded|revoked
  rotated_by uuid,
  created_at timestamptz default now()
);
create unique index if not exists uq_credential_versions on credential_versions (tenant_id, provider, version);

-- Who/what read a secret, and why. Feeds Vault usage audit + secret-abuse detection.
create table if not exists credential_access_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider text not null,
  actor_id uuid,
  actor_type text not null default 'system',   -- user|service_account|api_key|system
  purpose text,                                -- generation|publishing|analytics|test|rotation
  outcome text not null default 'granted',     -- granted|denied
  denied_reason text,
  created_at timestamptz default now()
);
create index if not exists idx_cred_access_tenant on credential_access_log (tenant_id, created_at desc);

-- Per-tenant/provider access policy (who may read a secret, and for what).
create table if not exists credential_access_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider text,                               -- NULL = all providers
  allowed_purposes text[] not null default '{}',   -- empty = any purpose
  allowed_roles text[] not null default '{}',      -- empty = any tenant role
  require_mfa boolean not null default false,
  created_at timestamptz default now()
);
create unique index if not exists uq_cred_policy on credential_access_policies (tenant_id, provider);

-- KMS key hierarchy (ADR-057). Platform-managed keys are real records used for
-- envelope-key lifecycle/rotation tracking. BYOK is a documented SEAM:
-- `provider='external'` rows require a configured external KMS and are
-- deliberately inactive until one is connected — never faked.
create table if not exists kms_keys (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null default 'platform',   -- platform|organization|tenant
  scope_id uuid,
  purpose text not null,                          -- root|data_encryption
  provider text not null default 'platform',      -- platform|external (BYOK seam)
  external_key_ref text,                          -- set only when a real external KMS is connected
  version int not null default 1,
  status text not null default 'active',          -- active|rotating|retired|pending_external
  health text not null default 'healthy',
  rotated_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz default now(),
  constraint kms_external_requires_ref check (
    provider <> 'external' or status = 'pending_external' or external_key_ref is not null
  )
);
create index if not exists idx_kms_scope on kms_keys (scope_type, scope_id, status);

do $$
declare t text;
begin
  foreach t in array array['credential_versions','credential_access_log','credential_access_policies'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_read on %I', t);
    execute format($f$create policy tenant_read on %I for select to authenticated
      using (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()))$f$, t);
    execute format('drop policy if exists tenant_admin on %I', t);
    execute format($f$create policy tenant_admin on %I for all to authenticated
      using (public.is_super_admin()) with check (public.is_super_admin())$f$, t);
  end loop;
end $$;

alter table kms_keys enable row level security;
drop policy if exists kms_admin on kms_keys;
create policy kms_admin on kms_keys for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- Platform root key record (metadata only; Supabase Vault performs encryption).
insert into kms_keys (scope_type, purpose, provider, status, health)
select 'platform', 'root', 'platform', 'active', 'healthy'
where not exists (select 1 from kms_keys where scope_type='platform' and purpose='root');
