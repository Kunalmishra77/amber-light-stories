-- M14 B4/B5/B6 + M13 closeout, consolidated.
--   B5  domain registry + data contracts + schema-evolution registry;
--       Global Config Service GENERALIZED from the M13 policy engine shape
--       (versioned, one-active, layered tighten-only) — not a duplicate of it.
--   B4  storage lifecycle/retention + permission-filtered LEXICAL search
--       (semantic/vector stays gated under M12 R1-03) + cache invalidation log.
--   B6  retention execution, hard-delete workflow, lineage, residency, and
--       real data-quality/integrity findings.
--   M13 closeout: sub-processor register.

-- ============================ B5: domains ============================
create table if not exists domains (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,                 -- content|pipeline|publishing|analytics|security|billing|platform
  name text not null,
  owner text,                               -- accountable owner (ADR-075)
  steward text,                             -- maintains the data contract
  description text,
  sla jsonb not null default '{}',          -- availability/freshness commitments
  version_policy text default 'additive-first',
  status text not null default 'active',
  created_at timestamptz default now()
);

-- Exactly one aggregate-root owner per table (ADR-071). Other domains hold
-- references (IDs) and must never write across the boundary.
create table if not exists domain_tables (
  id uuid primary key default gen_random_uuid(),
  domain_key text not null references domains(key) on delete cascade,
  table_name text not null unique,          -- the uniqueness IS the "one owner" rule
  is_aggregate_root boolean not null default false,
  classification text,                      -- mirrors data_classifications.level
  created_at timestamptz default now()
);

create table if not exists data_contracts (
  id uuid primary key default gen_random_uuid(),
  domain_key text not null references domains(key) on delete cascade,
  name text not null,
  version int not null default 1,
  schema jsonb not null default '{}',
  consumer_rules jsonb not null default '{}',
  status text not null default 'active',    -- active|deprecated|retired
  deprecated_at timestamptz,
  sunset_at timestamptz,
  created_at timestamptz default now()
);
create unique index if not exists uq_data_contracts on data_contracts (domain_key, name, version);

-- ADR-076: every schema change is recorded with its evolution phase.
create table if not exists schema_migrations_registry (
  id uuid primary key default gen_random_uuid(),
  migration text not null unique,           -- file name
  phase text not null default 'expand',     -- expand|migrate|contract
  additive boolean not null default true,
  breaking boolean not null default false,
  applied_at timestamptz default now(),
  notes text
);

do $$
declare t text;
begin
  foreach t in array array['domains','domain_tables','data_contracts','schema_migrations_registry'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists read_all_auth on %I', t);
    execute format('create policy read_all_auth on %I for select to authenticated using (true)', t);
    execute format('drop policy if exists admin_write on %I', t);
    execute format('create policy admin_write on %I for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin())', t);
  end loop;
end $$;

insert into domains (key, name, owner, steward, description) values
  ('content','Content','platform','platform','Stories, scenes, assets, prompts, memory'),
  ('pipeline','Pipeline','platform','platform','Runs, stages, jobs, workflows'),
  ('publishing','Publishing','platform','platform','Channels, videos, publications'),
  ('analytics','Analytics','platform','platform','Metrics ingestion and rollups'),
  ('security','Security','platform','platform','Identity, policy, audit, incidents'),
  ('billing','Billing','platform','platform','Plans, subscriptions, usage, credits'),
  ('platform','Platform','platform','platform','Tenancy, settings, operations')
on conflict do nothing;

insert into domain_tables (domain_key, table_name, is_aggregate_root) values
  ('content','stories',true),('content','scenes',false),('content','assets',true),
  ('content','asset_library_items',true),('content','content_memory',true),
  ('pipeline','pipeline_runs',true),('pipeline','pipeline_stages',false),
  ('pipeline','jobs',true),('pipeline','workflow_runs',true),
  ('publishing','channels',true),('publishing','videos',true),
  ('analytics','analytics',true),('analytics','api_usage',true),
  ('security','security_audit',true),('security','security_policies',true),
  ('security','privileged_grants',true),('security','security_incidents',true),
  ('billing','subscriptions',true),('billing','plans',true),
  ('platform','tenants',true),('platform','organizations',true)
on conflict do nothing;

-- ==================== B5: Global Configuration Service ====================
-- Same governed shape as M13 security_policies (versioned, one active,
-- immutable, layered tighten-only) but for general configuration (ADR-079).
create table if not exists config_entries (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null,                 -- platform|organization|tenant
  scope_id uuid,
  namespace text not null,                  -- e.g. pipeline|storage|api|features
  key text not null,
  active_version_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint config_scope_check check (
    (scope_type='platform' and scope_id is null) or (scope_type in ('organization','tenant') and scope_id is not null)
  )
);
create unique index if not exists uq_config_platform on config_entries (namespace, key) where scope_type='platform';
create unique index if not exists uq_config_scoped on config_entries (scope_type, scope_id, namespace, key) where scope_id is not null;

create table if not exists config_versions (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references config_entries(id) on delete cascade,
  version int not null,
  value jsonb not null default '{}',
  state text not null default 'draft',      -- draft|active|archived
  immutable boolean not null default false,
  created_by uuid,
  created_at timestamptz default now()
);
create unique index if not exists uq_config_versions on config_versions (entry_id, version);

do $$
begin
  if not exists (select 1 from pg_constraint where conname='config_entries_active_fk') then
    alter table config_entries add constraint config_entries_active_fk
      foreign key (active_version_id) references config_versions(id) on delete set null;
  end if;
end $$;

create or replace function public.enforce_config_version_immutability()
returns trigger language plpgsql as $$
begin
  if old.immutable and (new.value is distinct from old.value or new.version is distinct from old.version) then
    raise exception 'config_versions %: immutable version cannot be modified', old.id using errcode='check_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_config_version_immutability on config_versions;
create trigger trg_config_version_immutability before update on config_versions
  for each row execute function public.enforce_config_version_immutability();

alter table config_entries enable row level security;
drop policy if exists config_read on config_entries;
create policy config_read on config_entries for select to authenticated
  using (public.is_super_admin() or scope_type='platform' or (scope_type='tenant' and scope_id in (select public.my_tenant_ids())));
drop policy if exists config_admin on config_entries;
create policy config_admin on config_entries for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
alter table config_versions enable row level security;
drop policy if exists config_versions_read on config_versions;
create policy config_versions_read on config_versions for select to authenticated using (true);
drop policy if exists config_versions_admin on config_versions;
create policy config_versions_admin on config_versions for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- ==================== B4: storage lifecycle + search + cache ==============
create table if not exists storage_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,   -- NULL = platform default
  bucket text not null default 'assets',
  provider text not null default 'supabase',                 -- adapter key (provider-abstracted)
  retention_days int,
  archive_after_days int,
  max_object_bytes bigint,
  created_at timestamptz default now()
);
create unique index if not exists uq_storage_policy_tenant on storage_policies (tenant_id, bucket) where tenant_id is not null;
create unique index if not exists uq_storage_policy_platform on storage_policies (bucket) where tenant_id is null;
insert into storage_policies (tenant_id, bucket, provider, retention_days, archive_after_days)
select null,'assets','supabase',null,365
where not exists (select 1 from storage_policies where tenant_id is null and bucket='assets');

-- Permission-filtered LEXICAL search index. Semantic/vector search is NOT
-- built here — it stays gated under M12 R1-03 (no pgvector installed).
create table if not exists search_index (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  resource_type text not null,              -- story|asset|video|prompt|character
  resource_id uuid not null,
  title text,
  body text,
  tsv tsvector,
  updated_at timestamptz default now()
);
create unique index if not exists uq_search_resource on search_index (tenant_id, resource_type, resource_id);
create index if not exists idx_search_tsv on search_index using gin (tsv);
create index if not exists idx_search_tenant on search_index (tenant_id, resource_type);

create or replace function public.search_index_tsv()
returns trigger language plpgsql as $$
begin
  new.tsv := to_tsvector('simple', coalesce(new.title,'') || ' ' || coalesce(new.body,''));
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_search_index_tsv on search_index;
create trigger trg_search_index_tsv before insert or update on search_index
  for each row execute function public.search_index_tsv();

-- Event-driven cache invalidation record (consumed by the app cache layer).
create table if not exists cache_invalidations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  cache_key text not null,                  -- tenant-prefixed key or tag
  reason text,
  created_at timestamptz default now()
);
create index if not exists idx_cache_inval on cache_invalidations (tenant_id, created_at desc);

-- ==================== B6: governance execution + quality ==================
create table if not exists retention_runs (
  id uuid primary key default gen_random_uuid(),
  resource text not null,
  retention_days int not null,
  scanned int not null default 0,
  deleted int not null default 0,
  dry_run boolean not null default true,
  ran_at timestamptz default now(),
  notes text
);

create table if not exists deletion_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  resource text not null,
  resource_id uuid,
  mode text not null default 'soft',        -- soft|hard
  status text not null default 'requested', -- requested|approved|executing|completed|failed
  requested_by uuid,
  approved_by uuid,                         -- hard delete requires a second party
  executed_at timestamptz,
  created_at timestamptz default now()
);
-- Irreversible hard deletes need explicit approval by a different person.
create or replace function public.enforce_hard_delete_approval()
returns trigger language plpgsql as $$
begin
  if new.mode = 'hard' and new.status in ('executing','completed') then
    if new.approved_by is null then
      raise exception 'deletion_requests: a hard delete requires explicit approval' using errcode='check_violation';
    end if;
    if new.approved_by = new.requested_by then
      raise exception 'deletion_requests: a hard delete cannot be self-approved' using errcode='check_violation';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_hard_delete_approval on deletion_requests;
create trigger trg_hard_delete_approval before insert or update on deletion_requests
  for each row execute function public.enforce_hard_delete_approval();

create table if not exists data_lineage (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  source_type text not null,
  source_id uuid,
  derived_type text not null,
  derived_id uuid,
  relation text not null default 'derived_from',
  correlation_id uuid,
  created_at timestamptz default now()
);
create index if not exists idx_lineage_source on data_lineage (source_type, source_id);
create index if not exists idx_lineage_derived on data_lineage (derived_type, derived_id);

-- Residency ARCHITECTURE: declared + enforceable at the storage/routing layer.
create table if not exists residency_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  region text not null,                     -- e.g. eu-west-1
  enforced boolean not null default false,  -- false until a real regional target exists
  notes text,
  created_at timestamptz default now()
);
create unique index if not exists uq_residency_tenant on residency_policies (tenant_id);

create table if not exists data_quality_findings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  check_key text not null,                  -- orphan_reference|missing_tenant|duplicate|drift|integrity
  resource text not null,
  severity text not null default 'warning',
  count int not null default 0,
  evidence jsonb not null default '{}',
  status text not null default 'open',
  detected_at timestamptz default now()
);
create index if not exists idx_dq_findings on data_quality_findings (tenant_id, status, detected_at desc);

-- M13 CLOSEOUT: sub-processor register (GDPR Art.30 evidence).
create table if not exists sub_processors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  purpose text not null,
  data_categories text[] not null default '{}',
  region text,
  dpa_url text,
  status text not null default 'active',    -- active|retired
  reviewed_at timestamptz,
  created_at timestamptz default now()
);
create unique index if not exists uq_sub_processors on sub_processors (name);
insert into sub_processors (name, purpose, data_categories, region, status) values
  ('Supabase','Database, auth, storage and vault','{tenant_content,credentials,audit}','us/eu','active'),
  ('Vercel','Application hosting and edge delivery','{request_metadata}','global','active'),
  ('YouTube (Google)','Publishing destination and analytics','{published_content,channel_metrics}','global','active')
on conflict do nothing;

do $$
declare t text;
begin
  foreach t in array array['storage_policies','search_index','cache_invalidations','deletion_requests','data_lineage','residency_policies','data_quality_findings'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_scope on %I', t);
    execute format($f$create policy tenant_scope on %I for all to authenticated
      using (public.is_super_admin() or tenant_id is null or tenant_id in (select public.my_tenant_ids()))
      with check (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()))$f$, t);
  end loop;
  foreach t in array array['retention_runs','sub_processors'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists read_all_auth on %I', t);
    execute format('create policy read_all_auth on %I for select to authenticated using (true)', t);
    execute format('drop policy if exists admin_write on %I', t);
    execute format('create policy admin_write on %I for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin())', t);
  end loop;
end $$;
