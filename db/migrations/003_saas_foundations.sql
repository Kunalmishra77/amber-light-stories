-- S0 SaaS Foundations: tenancy + identity + RBAC (additive, idempotent).
-- RLS is NOT enabled here (that is S1). This lays the schema + seeds + backfill.

-- ============ Tenancy ============
create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  status text not null default 'active',      -- pending|active|suspended|locked|deleted
  plan_id uuid,
  onboarding_id uuid,
  created_by uuid,
  created_at timestamptz default now(),
  deleted_at timestamptz
);

create table if not exists tenant_settings (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  country text, timezone text default 'UTC', language text default 'en',
  secondary_language text, currency text default 'USD', date_format text default 'YYYY-MM-DD',
  industry text, audience jsonb default '{}', brand jsonb default '{}',
  content_style text, tone text, upload_frequency text, target_platform text default 'youtube_shorts',
  keywords text[] default '{}', negative_keywords text[] default '{}', competitors text[] default '{}',
  festival_calendar jsonb default '{}', seo_style text,
  per_video_budget_usd numeric default 1.55, config jsonb default '{}'
);

-- ============ Identity / RBAC ============
create table if not exists profiles (
  user_id uuid primary key,                   -- = auth.users.id
  full_name text, avatar text,
  is_super_admin boolean default false,
  created_at timestamptz default now()
);

create table if not exists roles (
  key text primary key, label text not null, level int not null default 0
);
create table if not exists permissions (
  key text primary key, label text not null, category text
);
create table if not exists role_permissions (
  role_key text references roles(key) on delete cascade,
  permission_key text references permissions(key) on delete cascade,
  primary key (role_key, permission_key)
);
create table if not exists memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  user_id uuid not null,
  role text references roles(key),
  status text default 'active',
  invited_by uuid, created_at timestamptz default now(),
  unique (tenant_id, user_id)
);
create table if not exists invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  email text not null, role text references roles(key),
  token text unique default gen_random_uuid()::text,
  status text default 'pending', expires_at timestamptz, created_at timestamptz default now()
);

-- ============ Feature flags (global + per-tenant) ============
create table if not exists feature_flags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,   -- null = global
  key text not null, enabled boolean default false, config jsonb default '{}',
  unique (tenant_id, key)
);

-- ============ Add tenant_id to existing tenant-scoped tables ============
alter table projects        add column if not exists tenant_id uuid references tenants(id);
alter table stories         add column if not exists tenant_id uuid references tenants(id);
alter table scenes          add column if not exists tenant_id uuid references tenants(id);
alter table series          add column if not exists tenant_id uuid references tenants(id);
alter table pipeline_runs   add column if not exists tenant_id uuid references tenants(id);
alter table pipeline_stages add column if not exists tenant_id uuid references tenants(id);
alter table stage_versions  add column if not exists tenant_id uuid references tenants(id);
alter table characters      add column if not exists tenant_id uuid references tenants(id);
alter table character_versions add column if not exists tenant_id uuid references tenants(id);
alter table assets          add column if not exists tenant_id uuid references tenants(id);
alter table prompts         add column if not exists tenant_id uuid references tenants(id);
alter table voices          add column if not exists tenant_id uuid references tenants(id);
alter table style_profiles  add column if not exists tenant_id uuid references tenants(id);
alter table render_jobs     add column if not exists tenant_id uuid references tenants(id);
alter table api_usage       add column if not exists tenant_id uuid references tenants(id);
alter table videos          add column if not exists tenant_id uuid references tenants(id);
alter table prompt_cache    add column if not exists tenant_id uuid references tenants(id);
alter table settings        add column if not exists tenant_id uuid references tenants(id);
alter table notifications   add column if not exists tenant_id uuid references tenants(id);
alter table audit_log       add column if not exists tenant_id uuid references tenants(id);

-- ============ Seed roles + baseline permissions ============
insert into roles(key,label,level) values
  ('super_admin','Super Admin',100),
  ('internal_admin','Internal Admin',90),
  ('client_owner','Client Owner',50),
  ('client_manager','Client Manager',40),
  ('client_editor','Client Editor',30),
  ('client_viewer','Client Viewer',10)
on conflict (key) do nothing;

insert into permissions(key,label,category) values
  ('workspace.view','View workspace','workspace'),
  ('content.view','View content','content'),
  ('content.create','Create content','content'),
  ('content.edit','Edit content','content'),
  ('content.approve','Approve content','content'),
  ('content.delete','Delete content','content'),
  ('schedule.manage','Manage schedule','schedule'),
  ('credentials.manage','Manage API credentials','credentials'),
  ('channels.manage','Manage channels','channels'),
  ('members.manage','Manage team members','members'),
  ('settings.manage','Manage settings','settings'),
  ('usage.view','View usage & cost','usage'),
  ('billing.view','View billing','billing'),
  ('billing.manage','Manage billing','billing'),
  ('admin.clients','Manage clients','admin'),
  ('admin.onboarding','Review onboarding','admin'),
  ('admin.platform','Manage platform (flags/routing/announcements)','admin'),
  ('admin.impersonate','Impersonate tenant','admin')
on conflict (key) do nothing;
