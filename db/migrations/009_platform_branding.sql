-- P6.1 Platform branding + theme engine. platform_settings is a singleton (id=1),
-- publicly readable (login page needs it pre-auth), super-admin writable.

create table if not exists platform_settings (
  id int primary key default 1,
  platform_name text default 'YT Automation',
  logo_url text, favicon_emoji text default '🎬',
  loading_message text default 'Loading your studio...',
  theme jsonb default '{}', updated_by uuid, updated_at timestamptz default now()
);

insert into platform_settings(id, platform_name, theme) values (
  1, 'YT Automation',
  '{"primary":"#F59E0B","primary_hover":"#FBBF24","accent":"#F59E0B","sidebar":"#0C0C0F",
    "background":"#0A0A0C","surface":"#141417","foreground":"#FAFAFA","radius":"0.75rem",
    "font":"Inter","mode":"dark","button_style":"solid"}'
) on conflict (id) do nothing;

alter table platform_settings enable row level security;
drop policy if exists read_all on platform_settings;
create policy read_all on platform_settings for select to anon, authenticated using (true);
drop policy if exists admin_write on platform_settings;
create policy admin_write on platform_settings for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- 'Amber Light Stories' becomes the Default tenant's client brand (not the platform brand).
update tenants set name = 'Amber Light Stories' where slug = 'default';
update tenant_settings set brand = '{"display_name":"Amber Light Stories","tagline":"Warm cinematic short stories","accent":"#F59E0B"}'
  where tenant_id = (select id from tenants where slug='default');
