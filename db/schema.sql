create extension if not exists pg_cron;

create table channels (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Amber Light Stories',
  yt_channel_id text,
  config jsonb default '{}',
  created_at timestamptz default now()
);

create table videos (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid references channels(id),
  topic text,
  status text default 'planned',   -- planned|scripting|generating|rendering|qa|ready|scheduled|published|failed
  scheduled_at timestamptz,
  published_at timestamptz,
  yt_video_id text,
  storage_key text,
  idempotency_key text unique,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index on videos (channel_id, status);
create index on videos (scheduled_at);

create table scripts (
  id uuid primary key default gen_random_uuid(),
  video_id uuid references videos(id),
  brief jsonb, body jsonb, provider text, tokens_used int,
  created_at timestamptz default now()
);

create table metadata (
  id uuid primary key default gen_random_uuid(),
  video_id uuid references videos(id),
  title text, description text, tags jsonb, chapters jsonb,
  created_at timestamptz default now()
);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  video_id uuid references videos(id),
  type text, status text default 'queued',   -- queued|running|done|failed|dead
  attempts int default 0, max_attempts int default 3,
  last_error text, run_after timestamptz default now(),
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create index on jobs (status, run_after);

create table api_usage (
  id uuid primary key default gen_random_uuid(),
  provider text, endpoint text, units numeric, cost_usd numeric,
  video_id uuid, created_at timestamptz default now()
);

create table analytics (
  id uuid primary key default gen_random_uuid(),
  video_id uuid references videos(id),
  snapshot_at timestamptz default now(),
  views int, ctr numeric, avg_view_pct numeric, watch_hours numeric,
  subs_gained int, rpm numeric
);
