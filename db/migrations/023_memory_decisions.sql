-- M12 G4: tenant-isolated structured Content Memory + explainable Decision
-- Records (ADR-043 / ADR-037).
--
-- Memory is STRUCTURED only (topics, reuse, usage counts). Semantic/vector
-- memory is deliberately NOT built here: it depends on paid embeddings and is
-- deferred with R1-03 (no pgvector is installed).
--
-- `performance` is populated ONLY from analytics rows whose source='live'.
-- Dry/sample analytics never write performance data — memory must never
-- present fabricated numbers as learned intelligence.

create table if not exists content_memory (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  kind text not null,                  -- topic|entity|hook|seo_term|character_usage
  key text not null,                   -- normalized lookup key
  label text,
  usage_count int not null default 0,
  first_used_at timestamptz,
  last_used_at timestamptz,
  story_ids uuid[] not null default '{}',
  performance jsonb not null default '{}',   -- ONLY from source='live' analytics
  meta jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index if not exists uq_content_memory_tenant_kind_key
  on content_memory (tenant_id, kind, key);
create index if not exists idx_content_memory_tenant_recent
  on content_memory (tenant_id, kind, last_used_at desc);

-- Every automated choice is recorded with its alternatives + signals so it can
-- be explained and audited (ADR-037). Written by the AI Gateway and the
-- quality/compliance gates — this EXTENDS the gateway, it is not a router.
create table if not exists decision_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  decision_type text not null,         -- provider_selection|quality_gate|compliance_gate|regeneration_scope
  run_id uuid references pipeline_runs(id) on delete set null,
  job_id uuid references jobs(id) on delete set null,
  workflow_run_id uuid references workflow_runs(id) on delete set null,
  chosen jsonb not null default '{}',
  alternatives jsonb not null default '[]',   -- rejected options + why
  signals jsonb not null default '{}',        -- inputs considered (credential presence, circuit state, scores…)
  policy text,                                -- execution policy in force
  rationale text,
  cost_estimate_usd numeric,
  created_at timestamptz default now()
);
create index if not exists idx_decisions_tenant_recent on decision_records (tenant_id, created_at desc);
create index if not exists idx_decisions_run on decision_records (run_id);

do $$
declare t text;
begin
  foreach t in array array['content_memory','decision_records'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format($f$create policy tenant_isolation on %I for all to authenticated
      using (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()))
      with check (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()))$f$, t);
  end loop;
end $$;
