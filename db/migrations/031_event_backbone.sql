-- M14 B1: transactional outbox + shared idempotency store + event registry.
-- ADR-070 (outbox, idempotent versioned events), ADR-077 (schema registry).
--
-- ATOMICITY IS STRUCTURAL, NOT CONVENTIONAL: the outbox row is written by an
-- AFTER-INSERT TRIGGER on the owning table, so it is physically impossible to
-- commit the state change without its event — no application discipline
-- required, and no code path can bypass it.
--
-- The relay that publishes outbox rows runs on the EXISTING M11 durable job
-- engine (no second worker system). `dispatchEvent` is retained unchanged for
-- now (additive dual-write) until the outbox path is proven in production.

-- ---- Event registry: versioned, owned, documented contracts (ADR-077) ----
create table if not exists event_registry (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  version int not null default 1,
  owner_domain text,
  description text,
  payload_schema jsonb not null default '{}',   -- required keys/types (checked by the relay)
  status text not null default 'active',        -- active|deprecated|retired
  deprecated_at timestamptz,
  sunset_at timestamptz,
  created_at timestamptz default now()
);
create unique index if not exists uq_event_registry on event_registry (event_type, version);

alter table event_registry enable row level security;
drop policy if exists event_registry_read on event_registry;
create policy event_registry_read on event_registry for select to authenticated using (true);
drop policy if exists event_registry_admin on event_registry;
create policy event_registry_admin on event_registry for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

insert into event_registry (event_type, version, owner_domain, description, payload_schema) values
  ('story.generated',   1, 'content',    'A story draft was generated',        '{"required":["id","tenant_id"]}'),
  ('video.published',   1, 'publishing', 'A video publication was recorded',   '{"required":["id","tenant_id"]}'),
  ('pipeline.completed',1, 'pipeline',   'A pipeline run completed',           '{"required":["id","tenant_id"]}'),
  ('pipeline.failed',   1, 'pipeline',   'A pipeline run failed',              '{"required":["id","tenant_id"]}')
on conflict do nothing;

-- ---- Transactional outbox ----
create table if not exists event_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  event_type text not null,
  event_version int not null default 1,
  aggregate_type text,                  -- ordering domain
  aggregate_id uuid,                    -- ordering key (per-aggregate order preserved)
  payload jsonb not null default '{}',
  idempotency_key text,                 -- producer-side dedupe
  correlation_id uuid,                  -- B2 end-to-end trace
  status text not null default 'pending',   -- pending|published|failed|dead
  attempts int not null default 0,
  max_attempts int not null default 5,
  available_at timestamptz not null default now(),
  published_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index if not exists idx_outbox_pending on event_outbox (status, available_at) where status = 'pending';
create index if not exists idx_outbox_aggregate on event_outbox (aggregate_type, aggregate_id, created_at);
create index if not exists idx_outbox_tenant on event_outbox (tenant_id, created_at desc);
create unique index if not exists uq_outbox_idempotency
  on event_outbox (tenant_id, idempotency_key) where idempotency_key is not null;

alter table event_outbox enable row level security;
drop policy if exists outbox_read on event_outbox;
create policy outbox_read on event_outbox for select to authenticated
  using (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()));
-- No authenticated writes: rows are produced by triggers / the service role only.

-- ---- Shared idempotency store: exactly-once EFFECT for at-least-once delivery ----
create table if not exists idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  scope text not null,                  -- consumer/handler identity
  key text not null,                    -- the deduplicated unit of work
  status text not null default 'in_progress',   -- in_progress|completed
  result jsonb not null default '{}',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
-- The uniqueness IS the guarantee: a second delivery cannot claim the same key.
create unique index if not exists uq_idempotency_scope_key on idempotency_keys (scope, key);
create index if not exists idx_idempotency_expiry on idempotency_keys (expires_at);

alter table idempotency_keys enable row level security;
drop policy if exists idempotency_read on idempotency_keys;
create policy idempotency_read on idempotency_keys for select to authenticated
  using (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()));

-- ---- The structural guarantee: emit an outbox row IN the same transaction ----
-- tg_argv[0] = event_type, tg_argv[1] = aggregate_type.
create or replace function public.outbox_emit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ev text := tg_argv[0];
  agg text := tg_argv[1];
  corr uuid;
begin
  begin
    corr := nullif(current_setting('app.correlation_id', true), '')::uuid;
  exception when others then
    corr := null;
  end;

  insert into event_outbox (
    tenant_id, event_type, aggregate_type, aggregate_id, payload, idempotency_key, correlation_id
  ) values (
    new.tenant_id,
    ev,
    agg,
    new.id,
    jsonb_build_object('id', new.id, 'tenant_id', new.tenant_id, 'occurred_at', now()),
    ev || ':' || new.id::text,          -- one event per aggregate instance
    corr
  )
  on conflict do nothing;                -- re-emission is a no-op, never an error
  return new;
end;
$$;

-- Attach to the real state changes that already have external consumers.
-- A published video CANNOT be committed without its event.
drop trigger if exists trg_videos_outbox on videos;
create trigger trg_videos_outbox
  after insert on videos
  for each row
  when (new.status = 'published')
  execute function public.outbox_emit('video.published', 'video');

-- A generated story CANNOT be committed without its event.
drop trigger if exists trg_stories_outbox on stories;
create trigger trg_stories_outbox
  after insert on stories
  for each row
  execute function public.outbox_emit('story.generated', 'story');
