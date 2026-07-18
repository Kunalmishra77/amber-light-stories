-- Cost-optimization schema: prompt cache, asset reuse, scene decision engine,
-- configurable model routing. Additive + idempotent.

-- Prompt cache: never pay twice for identical (prompt, model, params).
create table if not exists prompt_cache (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id),
  hash text unique not null,                 -- sha256(normalized_prompt+model+params)
  kind text,                                 -- image|motion|thumbnail
  model text,
  asset_id uuid references assets(id),
  prompt jsonb,
  created_at timestamptz default now()
);
create index if not exists idx_prompt_cache_hash on prompt_cache (hash);

-- Asset reuse fields.
alter table assets add column if not exists tags text[];
alter table assets add column if not exists reusable boolean default true;
alter table assets add column if not exists phash text;      -- perceptual hash (images)
alter table assets add column if not exists embedding jsonb; -- reserved for similarity

-- Scene decision engine metadata (drives fal-vs-local routing).
alter table scenes add column if not exists importance text;             -- HIGH|MEDIUM|LOW
alter table scenes add column if not exists importance_score numeric;
alter table scenes add column if not exists new_asset_required boolean default false;
alter table scenes add column if not exists existing_asset_allowed boolean default true;
alter table scenes add column if not exists recommended_quality text;    -- Low|Medium|High
alter table scenes add column if not exists motion_type text default 'ken_burns'; -- static|ken_burns|zoom|pan|motion_crop|ai_animation

-- Configurable settings (model routing, thresholds) — edit from dashboard, not code.
create table if not exists settings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id),
  kind text not null,                        -- model_routing|thresholds|...
  value jsonb not null default '{}',
  updated_at timestamptz default now(),
  unique (project_id, kind)
);
