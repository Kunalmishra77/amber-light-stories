-- Scale readiness: replace per-tenant N+1 loops in the platform console with
-- single grouped queries.
--
-- /admin/usage ran ~9 database round trips PER TENANT (and a write, via
-- rollupUsage) on every page view; /admin/health ran 3 per tenant including an
-- unbounded pipeline_runs scan. At a few hundred tenants that is thousands of
-- queries in one render and exhausts the connection pooler.
--
-- These are FIXED functions with all SQL hardcoded — the same decision as M14's
-- run_data_quality_checks(). No arbitrary SQL execution is introduced, and each
-- refuses a caller who is not a platform admin.

-- ============================ per-tenant usage ============================
-- Dropped first: the return type changed during development, and `create or
-- replace` cannot alter a function's OUT parameters.
drop function if exists public.admin_tenant_usage();
create or replace function public.admin_tenant_usage()
returns table (
  tenant_id uuid,
  tenant_name text,
  plan_name text,
  stories bigint,
  videos bigint,
  runs bigint,
  cost_usd numeric,
  planned_cost numeric
)
language sql stable security definer set search_path = public as $$
  select t.id,
         t.name,
         (select p.name
            from subscriptions s join plans p on p.id = s.plan_id
           where s.tenant_id = t.id
           order by s.created_at desc
           limit 1),
         (select count(*) from stories        where tenant_id = t.id),
         (select count(*) from videos         where tenant_id = t.id),
         (select count(*) from pipeline_runs  where tenant_id = t.id),
         coalesce((select sum(cost_usd) from api_usage where tenant_id = t.id), 0),
         coalesce((select sum(budget_usd) from pipeline_runs where tenant_id = t.id), 0)
    from tenants t
   where public.is_super_admin()
   order by t.name;
$$;

revoke all on function public.admin_tenant_usage() from public, anon;
grant execute on function public.admin_tenant_usage() to authenticated, service_role;

-- ============================ per-tenant health ============================
create or replace function public.admin_tenant_health()
returns table (
  tenant_id uuid,
  tenant_name text,
  runs_total bigint,
  runs_done bigint,
  runs_failed bigint,
  runs_running bigint,
  failed_stages bigint,
  failed_jobs bigint,
  dead_jobs bigint
)
language sql stable security definer set search_path = public as $$
  select t.id,
         t.name,
         (select count(*) from pipeline_runs r where r.tenant_id = t.id),
         (select count(*) from pipeline_runs r where r.tenant_id = t.id and r.status = 'done'),
         (select count(*) from pipeline_runs r where r.tenant_id = t.id and r.status = 'failed'),
         (select count(*) from pipeline_runs r where r.tenant_id = t.id and r.status = 'running'),
         (select count(*) from pipeline_stages s where s.tenant_id = t.id and s.status = 'failed'),
         (select count(*) from jobs j where j.tenant_id = t.id and j.status = 'failed'),
         (select count(*) from jobs j where j.tenant_id = t.id and j.status = 'dead')
    from tenants t
   where public.is_super_admin()
   order by t.name;
$$;

revoke all on function public.admin_tenant_health() from public, anon;
grant execute on function public.admin_tenant_health() to authenticated, service_role;

-- ========================= platform pipeline rollup =========================
-- /admin/pipeline pulled ~33,000 rows into Node and reduced them in JS, with
-- per-table caps of 5,000. Past that cap the numbers silently stopped being
-- totals — worse than a slow page, because nobody notices a wrong number.
-- Aggregating in the database makes them exact at any size.
create or replace function public.admin_stage_rollup()
returns table (
  stage text,
  total bigint,
  done bigint,
  failed bigint,
  skipped bigint,
  cost_usd numeric,
  duration_ms numeric,
  attempts numeric
)
language sql stable security definer set search_path = public as $$
  select s.stage,
         count(*),
         count(*) filter (where s.status in ('done', 'approved')),
         count(*) filter (where s.status in ('failed', 'rejected')),
         count(*) filter (where s.status = 'skipped'),
         coalesce(sum(s.cost_usd), 0),
         coalesce(sum(s.duration_ms), 0),
         coalesce(sum(s.attempts), 0)
    from pipeline_stages s
   where public.is_super_admin()
   group by s.stage
   order by count(*) desc;
$$;

revoke all on function public.admin_stage_rollup() from public, anon;
grant execute on function public.admin_stage_rollup() to authenticated, service_role;

create or replace function public.admin_provider_rollup()
returns table (provider text, cost_usd numeric, calls bigint)
language sql stable security definer set search_path = public as $$
  select coalesce(u.provider, 'unknown'),
         coalesce(sum(u.cost_usd), 0),
         count(*)
    from api_usage u
   where public.is_super_admin() and u.provider is not null
   group by u.provider
   order by sum(u.cost_usd) desc nulls last;
$$;

revoke all on function public.admin_provider_rollup() from public, anon;
grant execute on function public.admin_provider_rollup() to authenticated, service_role;

/**
 * Everything /admin/pipeline needs that is a single number, in one round trip.
 */
create or replace function public.admin_platform_totals()
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not public.is_super_admin() then '{}'::jsonb else jsonb_build_object(
    'quality_avg',        (select round(avg(overall)::numeric, 3) from quality_scores),
    'quality_count',      (select count(*) from quality_scores),
    'quality_manual',     (select count(*) from quality_scores where action = 'manual_review'),
    'quality_blocked',    (select count(*) from quality_scores where action = 'block'),
    'compliance_blocked', (select count(*) from compliance_checks where status = 'blocked'),
    'compliance_review',  (select count(*) from compliance_checks where status = 'manual_review'),
    'compliance_total',   (select count(*) from compliance_checks),
    'cache_entries',      (select count(*) from prompt_cache),
    'assets_total',       (select count(*) from assets),
    'assets_reusable',    (select count(*) from assets where reusable),
    'assets_duplicate',   (select count(*) - count(distinct phash) from assets where phash is not null),
    'decisions_total',    (select count(*) from approval_decisions),
    'decisions_approved', (select count(*) from approval_decisions where decision = 'approved'),
    'decisions_review',   (select count(*) from approval_decisions where decision = 'manual_review'),
    'decisions_blocked',  (select count(*) from approval_decisions where decision = 'blocked'),
    'decisions_rejected', (select count(*) from approval_decisions where decision = 'rejected'),
    'decisions_auto',     (select count(*) from approval_decisions where actor_type = 'automation'),
    'incidents_open',     (select count(*) from security_incidents where status in ('open','acknowledged','investigating')),
    'incidents_breached', (select count(*) from security_incidents where sla_breached and status in ('open','acknowledged','investigating')),
    'incidents_ops',      (select count(*) from security_incidents where category = 'operational'),
    'incidents_security', (select count(*) from security_incidents where category <> 'operational'),
    'review_backlog',     (select count(*) from pipeline_stages where status = 'awaiting_review'),
    'review_unassigned',  (select count(*) from pipeline_stages where status = 'awaiting_review' and assigned_to is null),
    'review_oldest_hours',(select round(extract(epoch from (now() - min(created_at))) / 3600.0, 1)
                             from pipeline_stages where status = 'awaiting_review')
  ) end;
$$;

revoke all on function public.admin_platform_totals() from public, anon;
grant execute on function public.admin_platform_totals() to authenticated, service_role;

-- Indexes the rollups lean on.
create index if not exists idx_pipeline_stages_status on pipeline_stages (status);
create index if not exists idx_jobs_tenant_status on jobs (tenant_id, status);
create index if not exists idx_pipeline_runs_tenant_status on pipeline_runs (tenant_id, status);
create index if not exists idx_api_usage_provider on api_usage (provider);
