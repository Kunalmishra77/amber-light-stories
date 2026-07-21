-- M12 G2: Format Profiles + locale as first-class dimensions (ADR-040/045/047/048).
-- Format is CONFIG consumed by the one pipeline; locale is a dimension, not a
-- parallel pipeline. Variant EXECUTION (repurposing render, translation,
-- localized voice) stays deferred — `content_variants` is the stable contract
-- that records intent and the gate reason, never fabricated output.

create table if not exists format_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,  -- NULL = platform default
  key text not null,                        -- youtube_shorts|youtube_long|reels|tiktok|...
  name text not null,
  aspect_ratio text not null default '9:16',
  target_seconds int,
  min_seconds int,
  max_seconds int,
  scene_budget int,
  pacing text default 'medium',             -- fast|medium|slow
  caption_style jsonb not null default '{}',
  audio_profile jsonb not null default '{}',
  publishing_provider text,                 -- registry publishing provider (ADR-015)
  is_default boolean not null default false,
  enabled boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
-- One row per key per tenant; platform defaults (tenant_id NULL) are unique per key.
create unique index if not exists uq_format_profiles_tenant_key
  on format_profiles (tenant_id, key) where tenant_id is not null;
create unique index if not exists uq_format_profiles_platform_key
  on format_profiles (key) where tenant_id is null;

alter table format_profiles enable row level security;
drop policy if exists format_profiles_read on format_profiles;
create policy format_profiles_read on format_profiles for select to authenticated
  using (public.is_super_admin() or tenant_id is null or tenant_id in (select public.my_tenant_ids()));
drop policy if exists format_profiles_write on format_profiles;
create policy format_profiles_write on format_profiles for all to authenticated
  using (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()))
  with check (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()));

-- Platform default profiles (config, not content).
insert into format_profiles (tenant_id, key, name, aspect_ratio, target_seconds, min_seconds, max_seconds, scene_budget, pacing, publishing_provider, is_default)
values
  (null, 'youtube_shorts', 'YouTube Shorts', '9:16', 45, 15, 60, 6, 'fast', 'youtube', true),
  (null, 'youtube_long',   'YouTube Long',   '16:9', 480, 120, 1800, 24, 'medium', 'youtube', false)
on conflict do nothing;

-- Locale as a dimension on the content the pipeline already produces.
alter table stories add column if not exists locale text not null default 'en';
alter table stories add column if not exists format_profile_id uuid references format_profiles(id);
alter table stories add column if not exists plan_item_id uuid;      -- calendar linkage (ADR-048)
alter table videos  add column if not exists locale text not null default 'en';

-- Calendar becomes a real generation input (ADR-048).
alter table plan_items add column if not exists campaign text;
alter table plan_items add column if not exists theme text;
alter table plan_items add column if not exists locale text not null default 'en';
alter table plan_items add column if not exists format_profile_id uuid references format_profiles(id);

-- Master -> variant intent. status='gated' records that execution is deferred
-- and WHY; nothing is generated until the dependency is authorized.
create table if not exists content_variants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  master_story_id uuid references stories(id) on delete cascade,
  variant_kind text not null,                 -- locale|format
  locale text,
  format_profile_id uuid references format_profiles(id),
  status text not null default 'gated',       -- gated|planned|generated|failed
  gated_reason text,                          -- the exact missing authorization/dependency
  story_id uuid references stories(id) on delete set null,   -- set only when really generated
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_content_variants_tenant on content_variants (tenant_id, master_story_id);

alter table content_variants enable row level security;
drop policy if exists tenant_isolation on content_variants;
create policy tenant_isolation on content_variants for all to authenticated
  using (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()))
  with check (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()));
