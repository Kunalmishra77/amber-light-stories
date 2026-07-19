-- S4 Content planner + per-tenant scheduler (additive, idempotent). RLS tenant-isolated.

create table if not exists content_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  month text, strategy jsonb default '{}', status text default 'draft',
  created_at timestamptz default now()
);
create table if not exists plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references content_plans(id) on delete cascade,
  tenant_id uuid references tenants(id) on delete cascade,
  scheduled_date date, topic text, angle text, pillar text,
  status text default 'planned',   -- planned|approved|disabled|locked|generating|scheduled|published|failed
  story_id uuid, position int, locked boolean default false,
  created_at timestamptz default now()
);
create table if not exists schedules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade unique,
  timezone text default 'UTC', days int[] default '{1,2,3,4,5}',
  publish_times text[] default '{09:00}', frequency text default 'daily',
  pause_dates date[] default '{}', holiday_mode boolean default false,
  emergency_stop boolean default false, retry_rules jsonb default '{}',
  upload_limit_per_day int default 1, updated_at timestamptz default now()
);

do $$
declare t text;
begin
  foreach t in array array['content_plans','plan_items','schedules'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format($f$create policy tenant_isolation on %I for all to authenticated
      using (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()))
      with check (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()))$f$, t);
  end loop;
end $$;
