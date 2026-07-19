-- S5 Commercial ops: billing (Stripe-ready), usage counters, rate limits, observability.
-- Additive, idempotent, RLS tenant-isolated (plans are a public catalog).

create table if not exists plans (
  id uuid primary key default gen_random_uuid(),
  name text not null, slug text unique, price_month numeric default 0,
  limits jsonb default '{}', features jsonb default '{}',
  active boolean default true, sort int default 0, created_at timestamptz default now()
);
create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  plan_id uuid references plans(id), status text default 'active',
  current_period_end timestamptz, stripe_ref text, created_at timestamptz default now()
);
create table if not exists credit_ledger (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  delta numeric not null, balance_after numeric, reason text, ref text,
  created_at timestamptz default now()
);
create table if not exists usage_counters (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  period text, videos int default 0, ai_calls int default 0,
  storage_bytes bigint default 0, cost_usd numeric default 0,
  updated_at timestamptz default now(), unique (tenant_id, period)
);
create table if not exists rate_limits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  action text, window_start timestamptz, count int default 0,
  unique (tenant_id, action, window_start)
);
create table if not exists event_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id),
  level text default 'info', source text, message text, meta jsonb default '{}',
  created_at timestamptz default now()
);

-- Seed catalog
insert into plans(name,slug,price_month,limits,sort) values
  ('Free','free',0,'{"videos_month":10,"ai_credits":50}',0),
  ('Starter','starter',29,'{"videos_month":60,"ai_credits":300}',1),
  ('Growth','growth',99,'{"videos_month":300,"ai_credits":1500}',2),
  ('Scale','scale',299,'{"videos_month":1200,"ai_credits":6000}',3)
on conflict (slug) do nothing;

-- RLS
alter table plans enable row level security;
drop policy if exists plans_read on plans;
create policy plans_read on plans for select to authenticated using (true);
drop policy if exists plans_admin on plans;
create policy plans_admin on plans for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

do $$
declare t text;
begin
  foreach t in array array['subscriptions','credit_ledger','usage_counters','rate_limits','event_log'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format($f$create policy tenant_isolation on %I for all to authenticated
      using (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()))
      with check (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()))$f$, t);
  end loop;
end $$;
