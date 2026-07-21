-- M11-1: Durable Job Engine core (ISS-P5-02 / ADR-030; foundations of P5-03, P5-11).
-- Evolves the EXISTING `jobs` table additively into a durable, tenant-scoped,
-- idempotent, leased job store — no parallel queue system. `tenant_id` + RLS
-- `tenant_isolation` already exist on the live table; re-asserted idempotently.
-- No CHECK on `status` (legacy rows use 'done'); lifecycle is enforced in code:
--   queued -> running -> succeeded
--   queued/running -> failed -> queued (retry, backoff) -> ... -> dead (DLQ)

alter table jobs add column if not exists tenant_id uuid references tenants(id);
alter table jobs add column if not exists run_id uuid;                 -- soft link to a pipeline_run (no FK: generic engine)
alter table jobs add column if not exists priority int not null default 0;  -- higher = claimed first
alter table jobs add column if not exists idempotency_key text;         -- dedupe within a tenant (exactly-once enqueue)
alter table jobs add column if not exists payload jsonb not null default '{}';
alter table jobs add column if not exists checkpoint jsonb not null default '{}';
alter table jobs add column if not exists locked_by text;               -- stateless-worker lease holder
alter table jobs add column if not exists locked_at timestamptz;
alter table jobs add column if not exists lease_expires_at timestamptz;
alter table jobs add column if not exists timeout_ms int not null default 300000;  -- lease TTL (5 min)
alter table jobs add column if not exists started_at timestamptz;
alter table jobs add column if not exists finished_at timestamptz;
alter table jobs add column if not exists dead_at timestamptz;

-- Idempotency: at most one live job per (tenant, key). Partial so key-less jobs
-- (and legacy null-key rows) are unconstrained.
create unique index if not exists uq_jobs_tenant_idempotency
  on jobs (tenant_id, idempotency_key) where idempotency_key is not null;

create index if not exists idx_jobs_tenant on jobs (tenant_id);
create index if not exists idx_jobs_claim on jobs (status, run_after, priority desc);
create index if not exists idx_jobs_lease on jobs (status, lease_expires_at);

-- Tenant isolation (idempotent re-assert; matches migration 004 shape).
alter table jobs enable row level security;
drop policy if exists tenant_isolation on jobs;
create policy tenant_isolation on jobs for all to authenticated
  using (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()))
  with check (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()));

-- ---- Atomic, contention-safe claim: lease queued/ready jobs to a worker ----
-- FOR UPDATE SKIP LOCKED guarantees two concurrent workers never grab the same
-- job. Increments attempts (a claim = an attempt) and sets the lease TTL.
create or replace function public.claim_jobs(
  p_worker text,
  p_limit int,
  p_now timestamptz default now()
) returns setof jobs
language plpgsql security definer set search_path = public as $$
begin
  return query
  update jobs j
  set status = 'running',
      locked_by = p_worker,
      locked_at = p_now,
      lease_expires_at = p_now + make_interval(secs => j.timeout_ms / 1000.0),
      started_at = coalesce(j.started_at, p_now),
      attempts = j.attempts + 1,
      updated_at = p_now
  where j.id in (
    select j2.id from jobs j2
    where j2.status = 'queued'
      and j2.run_after <= p_now
    order by j2.priority desc, j2.run_after asc
    for update skip locked
    limit greatest(p_limit, 0)
  )
  returning j.*;
end;
$$;

-- ---- Reaper: reclaim jobs whose worker lease expired (crash recovery) ----
-- Expired 'running' leases are requeued with backoff, or dead-lettered once
-- attempts are exhausted. Also SKIP LOCKED so it never fights live workers.
create or replace function public.reap_stale_jobs(
  p_now timestamptz default now()
) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with stale as (
    select id, attempts, max_attempts from jobs
    where status = 'running'
      and lease_expires_at is not null
      and lease_expires_at < p_now
    for update skip locked
  )
  update jobs j set
    status     = case when s.attempts >= s.max_attempts then 'dead' else 'queued' end,
    dead_at    = case when s.attempts >= s.max_attempts then p_now else j.dead_at end,
    run_after  = case when s.attempts >= s.max_attempts then j.run_after
                      else p_now + make_interval(secs => least(power(2, s.attempts)::int * 5, 3600)) end,
    last_error = 'lease expired',
    locked_by = null, locked_at = null, lease_expires_at = null,
    updated_at = p_now
  from stale s
  where j.id = s.id;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- The engine functions mutate across tenants and must run only via the
-- service-role runner — never a browser/authenticated session.
revoke all on function public.claim_jobs(text, int, timestamptz) from public, anon, authenticated;
revoke all on function public.reap_stale_jobs(timestamptz) from public, anon, authenticated;
