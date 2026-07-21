-- M12 G3: Quality Engine + Compliance/Safety gates (ADR-042 / ADR-044).
-- Scores are EXPLAINABLE and RULES-BASED (deterministic, computed from real
-- story/scene/format data). Pluggable AI evaluators are a later, authorized
-- tier — `evaluator` records which tier produced a score so an AI score can
-- never be mistaken for a rules score (or vice versa).

create table if not exists quality_dimensions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,  -- NULL = platform default
  key text not null,                    -- script_completeness|scene_coverage|duration_fit|seo_completeness|brand_alignment|continuity|safety
  label text not null,
  weight numeric not null default 1,
  min_score numeric not null default 0.6,
  blocking boolean not null default false,   -- high-stakes -> forces manual gate (ADR-042)
  enabled boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index if not exists uq_quality_dims_tenant_key
  on quality_dimensions (tenant_id, key) where tenant_id is not null;
create unique index if not exists uq_quality_dims_platform_key
  on quality_dimensions (key) where tenant_id is null;

alter table quality_dimensions enable row level security;
drop policy if exists quality_dims_read on quality_dimensions;
create policy quality_dims_read on quality_dimensions for select to authenticated
  using (public.is_super_admin() or tenant_id is null or tenant_id in (select public.my_tenant_ids()));
drop policy if exists quality_dims_write on quality_dimensions;
create policy quality_dims_write on quality_dimensions for all to authenticated
  using (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()))
  with check (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()));

insert into quality_dimensions (tenant_id, key, label, weight, min_score, blocking) values
  (null, 'script_completeness', 'Script completeness', 2, 0.7, false),
  (null, 'scene_coverage',      'Scene coverage vs format', 1.5, 0.6, false),
  (null, 'duration_fit',        'Duration fits format', 1.5, 0.6, false),
  (null, 'seo_completeness',    'SEO metadata completeness', 1, 0.6, false),
  (null, 'brand_alignment',     'Brand voice alignment', 1, 0.5, false),
  (null, 'continuity',          'Character/style continuity', 1, 0.5, false),
  (null, 'safety',              'Safety & policy', 2, 0.99, true)
on conflict do nothing;

create table if not exists quality_scores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  run_id uuid references pipeline_runs(id) on delete cascade,
  story_id uuid references stories(id) on delete set null,
  stage text not null,
  overall numeric not null,
  passed boolean not null,
  dimensions jsonb not null default '[]',   -- [{key,label,score,weight,min,passed,evidence}]
  action text not null,                     -- proceed|regenerate_partial|regenerate_full|manual_review|block
  regenerate_scope jsonb not null default '{}',  -- narrowest scope: {stage, sceneIds[]}
  evaluator text not null default 'rules',  -- rules | ai (ai = later authorized tier)
  created_at timestamptz default now()
);
create index if not exists idx_quality_scores_run on quality_scores (run_id, created_at desc);
create index if not exists idx_quality_scores_tenant on quality_scores (tenant_id);

create table if not exists compliance_checks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  run_id uuid references pipeline_runs(id) on delete cascade,
  story_id uuid references stories(id) on delete set null,
  gate text not null,                       -- pre_render|pre_publish
  status text not null,                     -- passed|blocked|manual_review
  findings jsonb not null default '[]',     -- [{rule,severity,message,evidence}]
  blocking_count int not null default 0,
  evaluator text not null default 'rules',
  created_at timestamptz default now()
);
create index if not exists idx_compliance_run on compliance_checks (run_id, created_at desc);
create index if not exists idx_compliance_tenant on compliance_checks (tenant_id);

do $$
declare t text;
begin
  foreach t in array array['quality_scores','compliance_checks'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format($f$create policy tenant_isolation on %I for all to authenticated
      using (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()))
      with check (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()))$f$, t);
  end loop;
end $$;
