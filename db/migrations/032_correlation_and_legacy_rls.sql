-- M14 B2: end-to-end correlation IDs, plus the M13-closeout fix for the two
-- legacy tables found by the M14 audit.
--
-- CORRELATION: one id threads request -> job -> workflow -> event -> provider
-- call -> audit, so an incident can be reconstructed across every domain.
-- Set per request/worker via `set_config('app.correlation_id', ...)`, which the
-- outbox trigger already reads.

alter table jobs             add column if not exists correlation_id uuid;
alter table workflow_runs    add column if not exists correlation_id uuid;
alter table security_audit   add column if not exists correlation_id uuid;
alter table audit_log        add column if not exists correlation_id uuid;
alter table event_log        add column if not exists correlation_id uuid;
alter table api_request_log  add column if not exists correlation_id uuid;
alter table api_usage        add column if not exists correlation_id uuid;
alter table pipeline_runs    add column if not exists correlation_id uuid;

create index if not exists idx_jobs_correlation            on jobs (correlation_id)            where correlation_id is not null;
create index if not exists idx_workflow_runs_correlation   on workflow_runs (correlation_id)   where correlation_id is not null;
create index if not exists idx_security_audit_correlation  on security_audit (correlation_id)  where correlation_id is not null;
create index if not exists idx_event_log_correlation       on event_log (correlation_id)       where correlation_id is not null;
create index if not exists idx_api_request_correlation     on api_request_log (correlation_id) where correlation_id is not null;
create index if not exists idx_pipeline_runs_correlation   on pipeline_runs (correlation_id)   where correlation_id is not null;

-- Read the ambient correlation id (NULL when unset) — used by writers/triggers.
create or replace function public.current_correlation_id()
returns uuid language plpgsql stable as $$
declare v uuid;
begin
  begin
    v := nullif(current_setting('app.correlation_id', true), '')::uuid;
  exception when others then
    v := null;
  end;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- M13 CLOSEOUT: `metadata` and `scripts` had RLS ENABLED but NO POLICY and no
-- tenant_id. That is an unsafe configuration: deny-all to authenticated users
-- (so the data is unreachable) AND unscoped (so nothing constrains it if a
-- policy is ever added carelessly).
--
-- Investigation (M14 audit): both hold REAL tenant-owned content (video titles/
-- descriptions/scripts), are FK'd to videos(id), and every row joins to a
-- video. They are legacy-but-live data, NOT obsolete — so they are scoped and
-- policied, not dropped.
--
-- Backfill derives tenant_id from the owning video. Rows whose video has no
-- tenant remain NULL and are therefore invisible under RLS — the safe default
-- for unattributed legacy data (deny, never leak).
-- ---------------------------------------------------------------------------
alter table metadata add column if not exists tenant_id uuid references tenants(id) on delete cascade;
alter table scripts  add column if not exists tenant_id uuid references tenants(id) on delete cascade;

update metadata m set tenant_id = v.tenant_id
  from videos v where v.id = m.video_id and m.tenant_id is null and v.tenant_id is not null;
update scripts s set tenant_id = v.tenant_id
  from videos v where v.id = s.video_id and s.tenant_id is null and v.tenant_id is not null;

create index if not exists idx_metadata_tenant on metadata (tenant_id);
create index if not exists idx_scripts_tenant  on scripts (tenant_id);

-- Keep new rows attributed automatically, so the gap cannot silently reopen.
create or replace function public.inherit_tenant_from_video()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.tenant_id is null and new.video_id is not null then
    select v.tenant_id into new.tenant_id from videos v where v.id = new.video_id;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_metadata_tenant on metadata;
create trigger trg_metadata_tenant before insert or update on metadata
  for each row execute function public.inherit_tenant_from_video();
drop trigger if exists trg_scripts_tenant on scripts;
create trigger trg_scripts_tenant before insert or update on scripts
  for each row execute function public.inherit_tenant_from_video();

do $$
declare t text;
begin
  foreach t in array array['metadata','scripts'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format($f$create policy tenant_isolation on %I for all to authenticated
      using (public.is_super_admin() or (tenant_id is not null and tenant_id in (select public.my_tenant_ids())))
      with check (public.is_super_admin() or (tenant_id is not null and tenant_id in (select public.my_tenant_ids())))$f$, t);
  end loop;
end $$;
