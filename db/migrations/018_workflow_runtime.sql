-- M11 Phase C: Workflow / DAG runtime layered ON TOP of the durable Job Engine.
-- The workflow layer ORCHESTRATES jobs (sequencing, deps, branching, failure
-- propagation); it never executes work itself and is not a second engine.
--   workflow_runs  — one execution of a DAG for a tenant (run-level state)
--   workflow_steps — the DAG nodes + their dependency edges and per-step status
--   jobs.workflow_run_id / workflow_step_id — links a durable job to its step

create table if not exists workflow_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  workflow_key text not null,                       -- which DAG definition
  status text not null default 'running',           -- running|succeeded|failed|cancelled
  context jsonb not null default '{}',              -- shared inputs/outputs (checkpoint)
  definition jsonb not null default '{}',           -- snapshot of the DAG at start (versioning/resume)
  idempotency_key text,                             -- exactly-once workflow start
  last_error text,
  started_at timestamptz default now(),
  finished_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index if not exists uq_workflow_runs_tenant_idem
  on workflow_runs (tenant_id, idempotency_key) where idempotency_key is not null;
create index if not exists idx_workflow_runs_tenant on workflow_runs (tenant_id, status);

create table if not exists workflow_steps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  workflow_run_id uuid not null references workflow_runs(id) on delete cascade,
  step_key text not null,
  job_type text not null,                           -- which registered handler runs this node
  depends_on text[] not null default '{}',          -- step_keys that must finish first
  status text not null default 'pending',           -- pending|running|succeeded|failed|skipped
  payload jsonb not null default '{}',              -- non-secret step inputs
  output jsonb not null default '{}',               -- handler checkpoint on success
  job_id uuid,                                      -- the durable job that ran it
  attempts int not null default 0,
  last_error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index if not exists uq_workflow_steps_run_key on workflow_steps (workflow_run_id, step_key);
create index if not exists idx_workflow_steps_run on workflow_steps (workflow_run_id, status);

-- Link durable jobs back to the DAG node they execute.
alter table jobs add column if not exists workflow_run_id uuid references workflow_runs(id) on delete set null;
alter table jobs add column if not exists workflow_step_id uuid references workflow_steps(id) on delete set null;
create index if not exists idx_jobs_workflow on jobs (workflow_run_id);

-- Standard tenant isolation (identical shape to migration 004).
do $$
declare t text;
begin
  foreach t in array array['workflow_runs','workflow_steps'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format($f$create policy tenant_isolation on %I for all to authenticated
      using (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()))
      with check (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()))$f$, t);
  end loop;
end $$;
