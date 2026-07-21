-- M11 Phase A: tenant-fair queue + per-tenant (plan-aware) concurrency caps.
-- ADR-031. Extends the M11-1 engine in place — no second queue.
--
-- Fairness model:
--   * Each tenant may have at most `tenant_job_concurrency(tenant)` jobs in
--     `running` at once (plan-aware, from the EXISTING plans.limits jsonb).
--   * Admission is ordered by the tenant's CURRENT running count first, so a
--     tenant with a large backlog cannot monopolise workers while another
--     tenant has none running.
--   * Atomic leasing + FOR UPDATE SKIP LOCKED semantics are preserved: the
--     fairness/window computation happens first (unlocked), then the chosen
--     ids are locked with SKIP LOCKED before the UPDATE.

-- Plan-aware concurrency cap. Reuses subscriptions -> plans.limits (no new
-- store). Falls back to 2 when the tenant has no active plan / no key set.
create or replace function public.tenant_job_concurrency(p_tenant uuid)
returns int
language sql stable security definer set search_path = public as $$
  select greatest(1, coalesce(
    (select nullif(p.limits->>'job_concurrency', '')::int
       from subscriptions s
       join plans p on p.id = s.plan_id
      where s.tenant_id = p_tenant
        and s.status = 'active'
      limit 1),
    2));
$$;
revoke all on function public.tenant_job_concurrency(uuid) from public, anon, authenticated;

-- Fair, cap-aware, atomic claim.
create or replace function public.claim_jobs(
  p_worker text,
  p_limit int,
  p_now timestamptz default now()
) returns setof jobs
language plpgsql security definer set search_path = public as $$
declare
  ids uuid[];
begin
  -- 1) Choose candidates honouring each tenant's concurrency cap and ordering
  --    by fairness (fewest currently-running first). No locks taken here, so
  --    window functions are allowed.
  select array_agg(y.id) into ids
  from (
    select x.id
    from (
      select j2.id,
             j2.tenant_id,
             j2.priority,
             j2.run_after,
             coalesce(r.n, 0) as running_now,
             public.tenant_job_concurrency(j2.tenant_id) as cap,
             row_number() over (
               partition by j2.tenant_id
               order by j2.priority desc, j2.run_after asc, j2.created_at asc
             ) as rn
      from jobs j2
      left join (
        select tenant_id, count(*) as n
        from jobs
        where status = 'running'
        group by tenant_id
      ) r on r.tenant_id is not distinct from j2.tenant_id
      where j2.status = 'queued'
        and j2.run_after <= p_now
    ) x
    -- admit only up to the tenant's remaining headroom
    where x.running_now + x.rn <= x.cap
    order by x.running_now asc, x.priority desc, x.run_after asc
    limit greatest(p_limit, 0)
  ) y;

  if ids is null then
    return;
  end if;

  -- 2) Lease them atomically. The inner SELECT ... FOR UPDATE SKIP LOCKED is a
  --    plain row-lock (no window fns), so two concurrent workers never lease
  --    the same job; the status re-check keeps it correct under contention.
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
    select j3.id from jobs j3
    where j3.id = any(ids)
      and j3.status = 'queued'
    for update skip locked
  )
  returning j.*;
end;
$$;
revoke all on function public.claim_jobs(text, int, timestamptz) from public, anon, authenticated;
