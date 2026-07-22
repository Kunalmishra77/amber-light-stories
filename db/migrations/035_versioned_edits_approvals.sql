-- M15 O1 + O2: versioned human edits, and an enforceable approval decision layer.
-- ADR-082 (edits never overwrite), ADR-080/081/083/084 (modes, conditional
-- approval, policy engine, chains).
--
-- O1 fixes a REAL data-integrity defect found in the M15 audit:
--   * editStage overwrote pipeline_stages.output (AI output destroyed)
--   * rollbackToStage set output = NULL (content destroyed, not restored)
--   * stage_versions existed but was never written (dead schema)
--
-- O2 fixes a REAL safety defect: M12 quality_scores.action and
-- compliance_checks.status were computed and stored but never consumed, so
-- "blocked" verdicts did not actually block anything.

-- ============================ O1: stage versions ============================
alter table stage_versions add column if not exists kind text not null default 'ai_generated';
  -- ai_generated | human_edited | regenerated | restored
alter table stage_versions add column if not exists created_by uuid;
alter table stage_versions add column if not exists immutable boolean not null default false;
alter table stage_versions add column if not exists source_version_id uuid references stage_versions(id) on delete set null;
alter table stage_versions add column if not exists checksum text;
alter table stage_versions add column if not exists note text;

create unique index if not exists uq_stage_versions_stage_version on stage_versions (stage_id, version);
create index if not exists idx_stage_versions_stage on stage_versions (stage_id, version desc);

-- Explicit active-version pointer (exactly one, by construction).
alter table pipeline_stages add column if not exists active_version_id uuid references stage_versions(id) on delete set null;

-- Versions are immutable once written: history can never be rewritten.
create or replace function public.enforce_stage_version_immutability()
returns trigger language plpgsql as $$
begin
  if old.immutable then
    if new.output is distinct from old.output
       or new.version is distinct from old.version
       or new.stage_id is distinct from old.stage_id
       or new.kind is distinct from old.kind then
      raise exception 'stage_versions %: an immutable version cannot be modified', old.id
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_stage_version_immutability on stage_versions;
create trigger trg_stage_version_immutability before update on stage_versions
  for each row execute function public.enforce_stage_version_immutability();

-- Deleting history is not a supported operation.
create or replace function public.block_stage_version_delete()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('app.version_purge', true), 'off') <> 'on' then
    raise exception 'stage_versions is append-only: edit history cannot be deleted'
      using errcode = 'check_violation';
  end if;
  return old;
end;
$$;
drop trigger if exists trg_stage_version_no_delete on stage_versions;
create trigger trg_stage_version_no_delete before delete on stage_versions
  for each row execute function public.block_stage_version_delete();

-- Atomically append the next version for a stage. Sequencing happens inside the
-- function under a row lock, so concurrent edits cannot collide on `version`
-- or corrupt the active pointer.
create or replace function public.append_stage_version(
  p_stage_id uuid,
  p_output jsonb,
  p_kind text,
  p_created_by uuid default null,
  p_source_version_id uuid default null,
  p_note text default null
) returns stage_versions
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_stage pipeline_stages%rowtype;
  v_next int;
  v_row stage_versions%rowtype;
begin
  -- Lock the owning stage: serialises concurrent edits for this stage only.
  select * into v_stage from pipeline_stages where id = p_stage_id for update;
  if not found then
    raise exception 'stage % not found', p_stage_id using errcode = 'no_data_found';
  end if;

  select coalesce(max(version), 0) + 1 into v_next from stage_versions where stage_id = p_stage_id;

  insert into stage_versions (
    tenant_id, stage_id, version, output, kind, created_by, source_version_id,
    checksum, note, immutable, model, cost_usd
  ) values (
    v_stage.tenant_id, p_stage_id, v_next, p_output, p_kind, p_created_by, p_source_version_id,
    encode(digest(coalesce(p_output::text, ''), 'sha256'), 'hex'), p_note, true, null, null
  ) returning * into v_row;

  -- The stage's live output and its active pointer move together.
  update pipeline_stages
     set output = p_output, active_version_id = v_row.id, updated_at = now()
   where id = p_stage_id;

  return v_row;
end;
$$;
revoke all on function public.append_stage_version(uuid, jsonb, text, uuid, uuid, text) from public, anon, authenticated;

-- ======================= O2: approval decision layer =======================
-- Same governed shape as M13 security_policies / M14 config_entries — versioned,
-- one active version, immutable once activated. NOT a second policy engine.
create table if not exists approval_policies (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null,                  -- platform|organization|tenant
  scope_id uuid,
  active_version_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint approval_policy_scope_check check (
    (scope_type = 'platform' and scope_id is null) or
    (scope_type in ('organization','tenant') and scope_id is not null)
  )
);
create unique index if not exists uq_approval_policy_platform on approval_policies (scope_type) where scope_type = 'platform';
create unique index if not exists uq_approval_policy_scoped on approval_policies (scope_type, scope_id) where scope_id is not null;

create table if not exists approval_policy_versions (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references approval_policies(id) on delete cascade,
  version int not null,
  body jsonb not null default '{}',
  state text not null default 'draft',       -- draft|active|archived
  immutable boolean not null default false,
  created_by uuid,
  created_at timestamptz default now()
);
create unique index if not exists uq_approval_policy_versions on approval_policy_versions (policy_id, version);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'approval_policies_active_fk') then
    alter table approval_policies add constraint approval_policies_active_fk
      foreign key (active_version_id) references approval_policy_versions(id) on delete set null;
  end if;
end $$;

create or replace function public.enforce_approval_policy_immutability()
returns trigger language plpgsql as $$
begin
  if old.immutable and (new.body is distinct from old.body or new.version is distinct from old.version) then
    raise exception 'approval_policy_versions %: immutable version cannot be modified', old.id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_approval_policy_immutability on approval_policy_versions;
create trigger trg_approval_policy_immutability before update on approval_policy_versions
  for each row execute function public.enforce_approval_policy_immutability();

-- Platform baseline: SEMI-AUTO with compliance ENFORCED and quality in
-- warn-then-enforce, exactly as agreed. Tenants may only tighten.
do $$
declare pid uuid; vid uuid;
begin
  if not exists (select 1 from approval_policies where scope_type = 'platform') then
    insert into approval_policies(scope_type) values ('platform') returning id into pid;
    insert into approval_policy_versions(policy_id, version, body, state, immutable)
    values (pid, 1, jsonb_build_object(
      'mode','semi_auto',
      'enforce_compliance', true,          -- blocked = hard block, never bypassable
      'enforce_quality', false,            -- warn-then-enforce (tightenable)
      'quality_manual_review', true,       -- manual_review routes to a human
      'first_run_requires_review', true,   -- signal, not a hard block
      'respect_cost_governor', true,
      'stage_matrix', jsonb_build_object(
        'publish','required',
        'compliance_pre_publish','required',
        'compliance_pre_render','required',
        'human_review','required',
        'quality_gate','conditional'
      )
    ), 'active', true) returning id into vid;
    update approval_policies set active_version_id = vid where id = pid;
  end if;
end $$;

-- ---- Approval chains (ADR-084): ordered / parallel / quorum ----
create table if not exists approval_chains (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  key text not null,
  name text not null,
  execution text not null default 'ordered',   -- ordered|parallel
  quorum int,                                   -- for parallel chains
  enabled boolean not null default true,
  created_at timestamptz default now()
);
create unique index if not exists uq_approval_chains on approval_chains (tenant_id, key);

create table if not exists approval_chain_steps (
  id uuid primary key default gen_random_uuid(),
  chain_id uuid not null references approval_chains(id) on delete cascade,
  position int not null,
  approver_role text,
  approver_id uuid,
  required boolean not null default true,
  condition jsonb not null default '{}',        -- policy-driven conditional step
  created_at timestamptz default now()
);
create unique index if not exists uq_chain_step_position on approval_chain_steps (chain_id, position);

create table if not exists approval_chain_instances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  chain_id uuid not null references approval_chains(id) on delete cascade,
  run_id uuid references pipeline_runs(id) on delete cascade,
  stage_id uuid references pipeline_stages(id) on delete cascade,
  status text not null default 'pending',       -- pending|approved|rejected|cancelled
  current_position int not null default 1,
  requested_by uuid,
  created_at timestamptz default now(),
  completed_at timestamptz
);
create index if not exists idx_chain_instances on approval_chain_instances (tenant_id, status);

create table if not exists approval_chain_votes (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references approval_chain_instances(id) on delete cascade,
  step_id uuid references approval_chain_steps(id) on delete set null,
  approver_id uuid not null,
  decision text not null,                       -- approved|rejected
  note text,
  created_at timestamptz default now()
);
create unique index if not exists uq_chain_vote on approval_chain_votes (instance_id, approver_id);

-- Separation of duties: the requester may never approve their own chain.
create or replace function public.enforce_chain_separation()
returns trigger language plpgsql as $$
declare req uuid;
begin
  select requested_by into req from approval_chain_instances where id = new.instance_id;
  if req is not null and req = new.approver_id then
    raise exception 'approval_chain_votes: the requester cannot approve their own request (separation of duties)'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_chain_separation on approval_chain_votes;
create trigger trg_chain_separation before insert on approval_chain_votes
  for each row execute function public.enforce_chain_separation();

-- ---- The evidence record. NO DECISION WITHOUT EVIDENCE. ----
create table if not exists approval_decisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  run_id uuid references pipeline_runs(id) on delete cascade,
  stage_id uuid references pipeline_stages(id) on delete cascade,
  stage text,
  decision text not null,                       -- approved|rejected|manual_review|blocked
  mode text not null,                           -- manual|semi_auto|full_auto
  actor_id uuid,
  actor_type text not null default 'user',      -- user|automation
  quality_verdict text,
  quality_score numeric,
  compliance_verdict text,
  compliance_blocking int,
  cost_verdict text,
  first_run boolean,
  policy_version int,
  evidence jsonb not null default '{}',
  reasons text[] not null default '{}',
  resulting_action text,
  correlation_id uuid,
  created_at timestamptz default now()
);
create index if not exists idx_approval_decisions_run on approval_decisions (run_id, created_at desc);
create index if not exists idx_approval_decisions_tenant on approval_decisions (tenant_id, created_at desc);

-- Enforce the invariant at the database level, not by convention.
create or replace function public.enforce_decision_evidence()
returns trigger language plpgsql as $$
begin
  if new.evidence is null or new.evidence = '{}'::jsonb then
    raise exception 'approval_decisions: a decision must record the evidence it was based on'
      using errcode = 'check_violation';
  end if;
  if array_length(new.reasons, 1) is null then
    raise exception 'approval_decisions: a decision must record at least one reason'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_decision_evidence on approval_decisions;
create trigger trg_decision_evidence before insert on approval_decisions
  for each row execute function public.enforce_decision_evidence();

-- Decisions are an audit trail: never editable.
create or replace function public.block_decision_update()
returns trigger language plpgsql as $$
begin
  raise exception 'approval_decisions is append-only' using errcode = 'check_violation';
end;
$$;
drop trigger if exists trg_decision_no_update on approval_decisions;
create trigger trg_decision_no_update before update on approval_decisions
  for each row execute function public.block_decision_update();

-- ---- RLS ----
alter table approval_policies enable row level security;
drop policy if exists approval_policies_read on approval_policies;
create policy approval_policies_read on approval_policies for select to authenticated
  using (public.is_super_admin() or scope_type = 'platform'
         or (scope_type = 'tenant' and scope_id in (select public.my_tenant_ids())));
drop policy if exists approval_policies_admin on approval_policies;
create policy approval_policies_admin on approval_policies for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

alter table approval_policy_versions enable row level security;
drop policy if exists approval_policy_versions_read on approval_policy_versions;
create policy approval_policy_versions_read on approval_policy_versions for select to authenticated using (true);
drop policy if exists approval_policy_versions_admin on approval_policy_versions;
create policy approval_policy_versions_admin on approval_policy_versions for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

do $$
declare t text;
begin
  foreach t in array array['approval_chains','approval_chain_instances','approval_decisions'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format($f$create policy tenant_isolation on %I for all to authenticated
      using (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()))
      with check (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()))$f$, t);
  end loop;
  foreach t in array array['approval_chain_steps','approval_chain_votes'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists read_auth on %I', t);
    execute format('create policy read_auth on %I for select to authenticated using (true)', t);
    execute format('drop policy if exists admin_write on %I', t);
    execute format('create policy admin_write on %I for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin())', t);
  end loop;
end $$;

insert into schema_migrations_registry (migration, phase, additive, breaking, notes) values
  ('035_versioned_edits_approvals.sql','expand',true,false,'O1 stage versioning + O2 approval decision layer')
on conflict do nothing;
