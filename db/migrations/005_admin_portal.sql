-- S2 Super-Admin Portal: announcements + maintenance switch (additive, idempotent).
-- These tables were already provisioned live on the project's Supabase instance
-- ahead of this migration file; this captures them for repo/environment parity.

create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  audience text not null default 'all',        -- all|tenants|internal
  title text not null,
  body text not null,
  active boolean default true,
  created_by uuid,
  created_at timestamptz default now()
);

create table if not exists maintenance (
  id int primary key default 1,
  enabled boolean default false,
  message text,
  updated_by uuid,
  updated_at timestamptz default now()
);
insert into maintenance (id, enabled, message)
values (1, false, 'We are performing maintenance. Please check back shortly.')
on conflict (id) do nothing;

alter table announcements enable row level security;
drop policy if exists read_all on announcements;
create policy read_all on announcements for select to authenticated using (true);
drop policy if exists admin_write on announcements;
create policy admin_write on announcements for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

alter table maintenance enable row level security;
drop policy if exists read_all on maintenance;
create policy read_all on maintenance for select to authenticated using (true);
drop policy if exists admin_write on maintenance;
create policy admin_write on maintenance for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
