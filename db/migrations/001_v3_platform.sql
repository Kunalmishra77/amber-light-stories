-- v3 Cinematic Short-Form Studio — platform schema (additive, non-breaking).
-- Safe to re-run: everything uses IF NOT EXISTS. Existing v1 tables untouched.

-- ============ Tenancy / projects ============
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  owner uuid,                                   -- references auth.users (nullable pre-auth)
  name text not null default 'Amber Light Stories',
  niche text default 'Indian moral stories (Panchatantra-style fables)',
  language text default 'hi',                   -- narration/subtitle language
  aspect_ratio text default '9:16',
  target_seconds int default 45,
  per_video_budget_usd numeric default 1.55,    -- HARD cap (cost governor)
  auto_approve jsonb default '{}',              -- {"script": false, "voice": true, ...}
  config jsonb default '{}',
  created_at timestamptz default now()
);

-- ============ Multi-part series ============
create table if not exists series (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id),
  title text, premise text, total_parts int,
  characters jsonb,                             -- shared cast across parts
  created_at timestamptz default now()
);

-- ============ Stories (one story = one short video) ============
create table if not exists stories (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id),
  series_id uuid references series(id),
  part_number int,                             -- Part 1, 2, ... within a series
  video_id uuid references videos(id),         -- link to legacy v1 videos (compat)
  topic text, logline text, moral text, beat_sheet jsonb,
  style_profile_id uuid,
  status text default 'draft',
  duration_seconds numeric,
  created_at timestamptz default now()
);

-- ============ Pipeline state machine ============
create table if not exists pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  story_id uuid references stories(id),
  status text default 'running',               -- running|paused|done|failed|cancelled
  current_stage text,
  total_cost_usd numeric default 0,
  budget_usd numeric default 1.55,
  started_at timestamptz default now(),
  finished_at timestamptz
);

create table if not exists pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references pipeline_runs(id),
  stage text not null,                         -- topic|research|script|storyboard|...|publish
  seq int not null,
  status text default 'pending',               -- pending|running|awaiting_review|approved|rejected|regenerating|failed|done|skipped
  auto_approve boolean default false,
  output jsonb, model text, tokens_used int, cost_usd numeric,
  duration_ms int, attempts int default 0, last_error text,
  approved_by uuid, approved_at timestamptz,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create index if not exists idx_stages_run_seq on pipeline_stages (run_id, seq);
create index if not exists idx_stages_status on pipeline_stages (status);

create table if not exists stage_versions (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid references pipeline_stages(id),
  version int, output jsonb, cost_usd numeric, model text,
  created_at timestamptz default now()
);

-- ============ Cinematic scene graph ============
create table if not exists scenes (
  id uuid primary key default gen_random_uuid(),
  story_id uuid references stories(id),
  seq int, start_sec numeric, end_sec numeric,
  prompt jsonb,                                -- {subject,camera,lighting,color,emotion,motion,...}
  keyframe_asset_id uuid, motion_asset_id uuid,
  narration text, subtitle text, music_cue text, sfx_cue text,
  animate boolean default false                -- cost governor sets true for key scenes only
);

-- ============ Character library (upload-your-own supported) ============
create table if not exists characters (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id),
  name text,
  role text,                                   -- primary|secondary|extra
  source text default 'ai',                    -- ai|uploaded|hybrid
  ethnicity text,                              -- e.g. 'Indian'
  gender text,
  descriptor jsonb,                            -- face,hair,clothes,style,identity
  reference_asset_id uuid,                     -- uploaded/generated face reference
  seed bigint, lora_url text,
  created_at timestamptz default now()
);
create table if not exists character_versions (
  id uuid primary key default gen_random_uuid(),
  character_id uuid references characters(id),
  version int, descriptor jsonb, reference_asset_id uuid,
  created_at timestamptz default now()
);

-- ============ Media assets (versioned) ============
create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid, story_id uuid, scene_id uuid, character_id uuid,
  kind text,                                   -- keyframe|motion|audio|music|sfx|render|thumbnail|reference
  storage_path text, meta jsonb, cost_usd numeric,
  version int default 1, created_at timestamptz default now()
);

-- ============ Reference-learning (trending video analysis) ============
create table if not exists style_profiles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id),
  name text, source_urls jsonb,
  profile jsonb,                               -- {pacing,shots,color,transitions,narration,music}
  created_at timestamptz default now()
);

-- ============ Libraries ============
create table if not exists prompts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid, name text, kind text, template text,
  version int default 1, created_at timestamptz default now()
);
create table if not exists voices (
  id uuid primary key default gen_random_uuid(),
  project_id uuid, name text, provider text default 'elevenlabs',
  voice_id text, language text, settings jsonb,
  created_at timestamptz default now()
);

-- ============ Ops ============
create table if not exists render_jobs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid, status text default 'queued', progress numeric default 0,
  provider text, external_id text,
  started_at timestamptz, finished_at timestamptz, cost_usd numeric
);
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  project_id uuid, user_id uuid, kind text, title text, body text,
  read boolean default false, created_at timestamptz default now()
);
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  project_id uuid, user_id uuid, action text, target text, meta jsonb,
  created_at timestamptz default now()
);

-- ============ Extend existing v1 tables (additive) ============
alter table api_usage add column if not exists project_id uuid;
alter table api_usage add column if not exists story_id uuid;
alter table api_usage add column if not exists stage text;
alter table videos add column if not exists story_id uuid;
alter table videos add column if not exists project_id uuid;
alter table videos add column if not exists aspect_ratio text default '9:16';
