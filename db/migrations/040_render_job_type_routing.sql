-- Render worker integration with the M11 durable Job Engine.
--
-- The render pipeline (FFmpeg + provider adapters) cannot run on Vercel's
-- serverless Node runtime, so it runs as a SEPARATE Python worker process. Both
-- workers share the ONE `jobs` table (no second queue) — they must simply claim
-- DISJOINT job types: the web cron claims everything EXCEPT `render.run`, and
-- the Python render worker claims ONLY `render.run`.
--
-- `claim_jobs` gains two optional, defaulted type filters. With both null it
-- behaves exactly as before (fully backward-compatible), so existing callers
-- and every M11 test are unaffected.

-- Adding params changes the signature, so `create or replace` would leave the
-- old 3-arg function in place as an overload and make `claim_jobs(text,int)`
-- ambiguous. Drop it first; the new 5-arg form is backward-compatible because
-- the extra params default to null.
drop function if exists public.claim_jobs(text, integer, timestamp with time zone);

create or replace function public.claim_jobs(
  p_worker text,
  p_limit integer,
  p_now timestamp with time zone default now(),
  p_include_types text[] default null,   -- claim ONLY these types when set
  p_exclude_types text[] default null    -- never claim these types when set
)
returns setof jobs
language plpgsql security definer set search_path = public as $function$
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
        and (p_include_types is null or j2.type = any(p_include_types))
        and (p_exclude_types is null or not (j2.type = any(p_exclude_types)))
    ) x
    where x.running_now + x.rn <= x.cap
    order by x.running_now asc, x.priority desc, x.run_after asc
    limit greatest(p_limit, 0)
  ) y;

  if ids is null then
    return;
  end if;

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
$function$;

-- Keep the grants the original migration set.
revoke all on function public.claim_jobs(text, integer, timestamptz, text[], text[]) from public, anon;
grant execute on function public.claim_jobs(text, integer, timestamptz, text[], text[]) to authenticated, service_role;
