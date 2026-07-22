-- M15 O3-O6: human review center, operations center, notifications &
-- collaboration, and operational SLAs.
--
-- Deliberately EXTENDS what already exists rather than duplicating it:
--   * the review queue IS pipeline_stages (status = 'awaiting_review') — no
--     second queue table, so a stage can never be in two queues at once
--   * operational incidents EXTEND M13 security_incidents — one incident model
--   * playbooks reuse the M13/M14 versioned + one-active + immutable shape
--   * the platform-wide stop is a M14 Global Config entry, not a new mechanism
--   * notifications EXTEND the existing notifications table + lib/ops/notify
--   * operational analytics are COMPUTED from existing tables — no new store

-- ===================== O2 completion: decision intent ======================
-- Distinguishes advancing a run from repairing it. A compliance block must stop
-- an advance, but must never stop the edit that fixes it, or a blocked run
-- would be permanently unrecoverable.
alter table approval_decisions add column if not exists intent text not null default 'advance';
alter table approval_decisions add column if not exists chain_instance_id uuid references approval_chain_instances(id) on delete set null;
create index if not exists idx_approval_decisions_stage_decision
  on approval_decisions (run_id, stage, decision) where decision = 'approved';

-- Carry cost/model attribution onto archived versions. The 6-arg form is
-- dropped rather than overloaded: two functions differing only by defaulted
-- trailing args make every 6-arg call ambiguous.
drop function if exists public.append_stage_version(uuid, jsonb, text, uuid, uuid, text);

create or replace function public.append_stage_version(
  p_stage_id uuid,
  p_output jsonb,
  p_kind text default 'ai_generated',
  p_created_by uuid default null,
  p_source_version_id uuid default null,
  p_note text default null,
  p_model text default null,
  p_cost_usd numeric default null
) returns stage_versions
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_stage pipeline_stages;
  v_next int;
  v_row stage_versions;
begin
  -- Lock the stage so concurrent edits can't compute the same version number.
  select * into v_stage from pipeline_stages where id = p_stage_id for update;
  if not found then
    raise exception 'stage % not found', p_stage_id using errcode = 'no_data_found';
  end if;

  if p_kind not in ('ai_generated', 'human_edited', 'regenerated', 'restored') then
    raise exception 'invalid version kind %', p_kind using errcode = 'check_violation';
  end if;

  select coalesce(max(version), 0) + 1 into v_next from stage_versions where stage_id = p_stage_id;

  insert into stage_versions (
    tenant_id, stage_id, version, output, kind, created_by, source_version_id,
    checksum, note, immutable, model, cost_usd
  ) values (
    v_stage.tenant_id, p_stage_id, v_next, p_output, p_kind, p_created_by, p_source_version_id,
    encode(digest(coalesce(p_output::text, ''), 'sha256'), 'hex'), p_note, true, p_model, p_cost_usd
  ) returning * into v_row;

  -- The live output and the active pointer move together, in one transaction.
  update pipeline_stages
     set output = p_output, active_version_id = v_row.id, updated_at = now()
   where id = p_stage_id;

  return v_row;
end;
$$;

revoke all on function public.append_stage_version(uuid, jsonb, text, uuid, uuid, text, text, numeric) from public, anon;
grant execute on function public.append_stage_version(uuid, jsonb, text, uuid, uuid, text, text, numeric) to authenticated, service_role;

-- ======================= O3: human review experience =======================
-- The queue is pipeline_stages itself. These columns add triage without
-- creating a second source of truth for "what needs review".
alter table pipeline_stages add column if not exists review_priority int not null default 50;   -- 0 = most urgent
alter table pipeline_stages add column if not exists assigned_to uuid;
alter table pipeline_stages add column if not exists assigned_at timestamptz;
alter table pipeline_stages add column if not exists assigned_by uuid;
alter table pipeline_stages add column if not exists review_due_at timestamptz;
alter table pipeline_stages add column if not exists review_started_at timestamptz;

create index if not exists idx_pipeline_stages_review_queue
  on pipeline_stages (tenant_id, review_priority, review_due_at)
  where status = 'awaiting_review';
create index if not exists idx_pipeline_stages_assignee
  on pipeline_stages (tenant_id, assigned_to) where assigned_to is not null;

-- ========================= O4: operational incidents ========================
-- ONE incident model. M13 shipped security_incidents; operational incidents are
-- the same object with a different category, so responders have a single
-- inbox and a single lifecycle to learn.
alter table security_incidents add column if not exists category text not null default 'security';  -- security | operational
alter table security_incidents add column if not exists source text;              -- job.dead | sla.breach | quality.block | manual | ...
alter table security_incidents add column if not exists run_id uuid references pipeline_runs(id) on delete set null;
alter table security_incidents add column if not exists job_id uuid references jobs(id) on delete set null;
alter table security_incidents add column if not exists dedupe_key text;
alter table security_incidents add column if not exists sla_due_at timestamptz;
alter table security_incidents add column if not exists sla_breached boolean not null default false;
alter table security_incidents add column if not exists playbook_id uuid;
alter table security_incidents add column if not exists correlation_id uuid;

-- One OPEN incident per cause: repeated failures escalate an existing incident
-- instead of flooding the inbox with duplicates.
create unique index if not exists uq_incidents_open_dedupe
  on security_incidents (tenant_id, dedupe_key)
  where dedupe_key is not null and status in ('open', 'acknowledged', 'investigating');
create index if not exists idx_incidents_category
  on security_incidents (tenant_id, category, status, created_at desc);

-- ---------------------------- versioned playbooks --------------------------
create table if not exists ops_playbooks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,   -- null = platform baseline
  slug text not null,
  title text not null,
  trigger_source text,                       -- matches security_incidents.source
  active_version_id uuid,
  created_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index if not exists uq_ops_playbooks_platform on ops_playbooks (slug) where tenant_id is null;
create unique index if not exists uq_ops_playbooks_tenant on ops_playbooks (tenant_id, slug) where tenant_id is not null;

create table if not exists ops_playbook_versions (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid not null references ops_playbooks(id) on delete cascade,
  version int not null,
  steps jsonb not null default '[]',         -- [{ key, title, detail, action }]
  state text not null default 'active',      -- draft | active | retired
  immutable boolean not null default true,
  notes text,
  created_by uuid,
  created_at timestamptz default now(),
  unique (playbook_id, version)
);

alter table ops_playbooks
  drop constraint if exists ops_playbooks_active_fk;
alter table ops_playbooks
  add constraint ops_playbooks_active_fk
  foreign key (active_version_id) references ops_playbook_versions(id) on delete set null;

create or replace function public.enforce_playbook_version_immutability()
returns trigger language plpgsql as $$
begin
  if old.immutable and (
       new.steps is distinct from old.steps
    or new.version is distinct from old.version
    or new.playbook_id is distinct from old.playbook_id
  ) then
    raise exception 'ops_playbook_versions %: an immutable version cannot be modified', old.id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_playbook_version_immutable on ops_playbook_versions;
create trigger trg_playbook_version_immutable
  before update on ops_playbook_versions
  for each row execute function public.enforce_playbook_version_immutability();

-- What was actually DONE during an incident — the auditable half of a playbook.
create table if not exists ops_playbook_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  incident_id uuid references security_incidents(id) on delete cascade,
  playbook_id uuid references ops_playbooks(id) on delete set null,
  playbook_version int,
  step_key text not null,
  status text not null default 'done',       -- done | skipped | failed
  note text,
  actor_id uuid,
  created_at timestamptz default now()
);
create index if not exists idx_playbook_runs_incident on ops_playbook_runs (incident_id, created_at);

-- ============ O5: notification categories + preferences + comments ==========
alter table notifications add column if not exists category text not null default 'general';
  -- review | approval | publishing | incident | quality | billing | general
alter table notifications add column if not exists severity text not null default 'info';  -- info | warning | critical
alter table notifications add column if not exists link text;                -- deep link into the app
alter table notifications add column if not exists entity_type text;
alter table notifications add column if not exists entity_id uuid;
alter table notifications add column if not exists dedupe_key text;
alter table notifications add column if not exists delivered_email boolean not null default false;
alter table notifications add column if not exists delivered_webhook boolean not null default false;

create index if not exists idx_notifications_user_unread
  on notifications (tenant_id, user_id, read, created_at desc);
create unique index if not exists uq_notifications_dedupe
  on notifications (tenant_id, user_id, dedupe_key)
  where dedupe_key is not null;

create table if not exists notification_preferences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null,
  category text not null,
  in_app boolean not null default true,
  email boolean not null default false,
  webhook boolean not null default false,
  min_severity text not null default 'info',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (tenant_id, user_id, category)
);

-- ------------------------------- collaboration -----------------------------
create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  entity_type text not null,                 -- pipeline_stage | pipeline_run | story | incident
  entity_id uuid not null,
  parent_id uuid references comments(id) on delete cascade,
  body text not null,
  author_id uuid,
  resolved_at timestamptz,
  resolved_by uuid,
  edited_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists idx_comments_entity on comments (tenant_id, entity_type, entity_id, created_at);

create table if not exists comment_mentions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  comment_id uuid not null references comments(id) on delete cascade,
  user_id uuid not null,
  notified_at timestamptz,
  created_at timestamptz default now(),
  unique (comment_id, user_id)
);

-- ========================= O6: operational SLAs ============================
-- Targets are CONFIGURATION, not analytics: attainment is computed on read from
-- pipeline_stages / jobs / security_incidents, so no metrics store is added.
create table if not exists sla_definitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,   -- null = platform default
  slug text not null,
  title text not null,
  metric text not null,                      -- review_latency | publish_latency | incident_ack | incident_resolve | job_success_rate
  target_minutes int,
  target_ratio numeric,
  severity text not null default 'warning',
  enabled boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index if not exists uq_sla_platform on sla_definitions (slug) where tenant_id is null;
create unique index if not exists uq_sla_tenant on sla_definitions (tenant_id, slug) where tenant_id is not null;

-- ================================== RLS ====================================
alter table ops_playbooks enable row level security;
alter table ops_playbook_versions enable row level security;
alter table ops_playbook_runs enable row level security;
alter table notification_preferences enable row level security;
alter table comments enable row level security;
alter table comment_mentions enable row level security;
alter table sla_definitions enable row level security;

-- Platform baselines (tenant_id is null) are readable by every member; only
-- super admins can write them. Tenant rows follow normal tenant isolation.
drop policy if exists tenant_isolation on ops_playbooks;
create policy tenant_isolation on ops_playbooks for all
  using (public.is_super_admin() or (tenant_id is null) or tenant_id in (select public.my_tenant_ids()))
  with check (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()));

drop policy if exists tenant_isolation on ops_playbook_versions;
create policy tenant_isolation on ops_playbook_versions for all
  using (public.is_super_admin() or exists (
    select 1 from ops_playbooks p where p.id = playbook_id
      and (p.tenant_id is null or p.tenant_id in (select public.my_tenant_ids()))))
  with check (public.is_super_admin() or exists (
    select 1 from ops_playbooks p where p.id = playbook_id
      and p.tenant_id in (select public.my_tenant_ids())));

drop policy if exists tenant_isolation on ops_playbook_runs;
create policy tenant_isolation on ops_playbook_runs for all
  using (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()))
  with check (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()));

drop policy if exists tenant_isolation on sla_definitions;
create policy tenant_isolation on sla_definitions for all
  using (public.is_super_admin() or (tenant_id is null) or tenant_id in (select public.my_tenant_ids()))
  with check (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()));

-- Preferences are PERSONAL: a workspace member sees and edits only their own.
drop policy if exists own_preferences on notification_preferences;
create policy own_preferences on notification_preferences for all
  using (public.is_super_admin() or (user_id = auth.uid() and tenant_id in (select public.my_tenant_ids())))
  with check (public.is_super_admin() or (user_id = auth.uid() and tenant_id in (select public.my_tenant_ids())));

drop policy if exists tenant_isolation on comments;
create policy tenant_isolation on comments for all
  using (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()))
  with check (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()));

drop policy if exists tenant_isolation on comment_mentions;
create policy tenant_isolation on comment_mentions for all
  using (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()))
  with check (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()));

-- ============================== platform seeds =============================
-- Platform playbook baselines. Tenants inherit these; a tenant may publish its
-- own version without touching the baseline.
insert into ops_playbooks (tenant_id, slug, title, trigger_source)
values
  (null, 'job-dead-letter', 'Job dead-lettered', 'job.dead'),
  (null, 'compliance-block', 'Compliance blocked a run', 'quality.block'),
  (null, 'publish-failure', 'Publication failed', 'publish.failed'),
  (null, 'sla-breach', 'SLA breached', 'sla.breach')
on conflict do nothing;

insert into ops_playbook_versions (playbook_id, version, steps, notes)
select p.id, 1, v.steps, 'Platform baseline'
from ops_playbooks p
join (values
  ('job-dead-letter', '[
     {"key":"triage","title":"Read the failure","detail":"Open the job and read last_error plus the correlation trail."},
     {"key":"classify","title":"Transient or permanent?","detail":"Transient faults are safe to replay; a permanent fault needs a fix first."},
     {"key":"act","title":"Replay or discard","detail":"Replay from the queue once the cause is addressed."},
     {"key":"close","title":"Record the outcome","detail":"Resolve the incident with what was found and what changed."}
   ]'::jsonb),
  ('compliance-block', '[
     {"key":"read","title":"Read the findings","detail":"Open the compliance check and read every blocking finding."},
     {"key":"fix","title":"Fix the content","detail":"Edit or regenerate the stage. A block can never be approved away."},
     {"key":"reverify","title":"Re-run the gate","detail":"Confirm the check clears before advancing."},
     {"key":"close","title":"Resolve","detail":"Close the incident referencing the corrected version."}
   ]'::jsonb),
  ('publish-failure', '[
     {"key":"channel","title":"Check the channel","detail":"Confirm a channel is connected and its credentials are valid."},
     {"key":"retry","title":"Retry the publication","detail":"The publish job is idempotent per run; retrying cannot double-publish."},
     {"key":"escalate","title":"Escalate if it repeats","detail":"Two consecutive failures indicate a provider or credential problem."}
   ]'::jsonb),
  ('sla-breach', '[
     {"key":"identify","title":"Identify what is late","detail":"Open the SLA panel and find the breaching item."},
     {"key":"assign","title":"Assign an owner","detail":"Unassigned work is the most common cause of review latency."},
     {"key":"unblock","title":"Remove the blocker","detail":"Resolve the dependency or reprioritise the queue."}
   ]'::jsonb)
) as v(slug, steps) on v.slug = p.slug
where p.tenant_id is null
on conflict (playbook_id, version) do nothing;

update ops_playbooks p
   set active_version_id = pv.id
  from ops_playbook_versions pv
 where pv.playbook_id = p.id and pv.version = 1 and p.active_version_id is null;

-- Platform SLA defaults.
insert into sla_definitions (tenant_id, slug, title, metric, target_minutes, target_ratio, severity)
values
  (null, 'review-latency',   'Stage reviewed within 24h',      'review_latency',   1440, null, 'warning'),
  (null, 'publish-latency',  'Approved run published within 2h','publish_latency',  120, null, 'warning'),
  (null, 'incident-ack',     'Incident acknowledged within 1h', 'incident_ack',       60, null, 'critical'),
  (null, 'incident-resolve', 'Incident resolved within 24h',    'incident_resolve', 1440, null, 'warning'),
  (null, 'job-success-rate', 'Job success rate at or above 95%','job_success_rate', null, 0.95, 'warning')
on conflict do nothing;

-- Default notification categories are opt-IN for in-app and opt-OUT for email;
-- preferences rows are created on demand, so no per-user backfill is needed.
