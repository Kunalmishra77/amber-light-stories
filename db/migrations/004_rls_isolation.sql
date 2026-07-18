-- S1 Row-Level Security: tenant isolation on every table.
-- Service role bypasses RLS (backend workers keep working). The authed browser
-- client is filtered to the user's tenant memberships; super-admins see all.

-- ---- helper: is the current user a super admin? ----
create or replace function public.is_super_admin() returns boolean
  language sql security definer stable set search_path = public as $$
  select coalesce((select is_super_admin from profiles where user_id = auth.uid()), false);
$$;

-- ---- helper: tenant ids the current user belongs to ----
create or replace function public.my_tenant_ids() returns setof uuid
  language sql security definer stable set search_path = public as $$
  select tenant_id from memberships where user_id = auth.uid() and status = 'active';
$$;

-- ---- reference tables: readable by any authenticated user ----
do $$
declare t text;
begin
  foreach t in array array['roles','permissions','role_permissions'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists ref_read on %I', t);
    execute format('create policy ref_read on %I for select to authenticated using (true)', t);
  end loop;
end $$;

-- ---- identity tables ----
alter table profiles enable row level security;
drop policy if exists profiles_self on profiles;
create policy profiles_self on profiles for all to authenticated
  using (user_id = auth.uid() or public.is_super_admin())
  with check (user_id = auth.uid() or public.is_super_admin());

alter table tenants enable row level security;
drop policy if exists tenants_member on tenants;
create policy tenants_member on tenants for select to authenticated
  using (public.is_super_admin() or id in (select public.my_tenant_ids()));
drop policy if exists tenants_admin_write on tenants;
create policy tenants_admin_write on tenants for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

alter table memberships enable row level security;
drop policy if exists memberships_read on memberships;
create policy memberships_read on memberships for select to authenticated
  using (public.is_super_admin() or user_id = auth.uid() or tenant_id in (select public.my_tenant_ids()));
drop policy if exists memberships_write on memberships;
create policy memberships_write on memberships for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

alter table invitations enable row level security;
drop policy if exists invitations_tenant on invitations;
create policy invitations_tenant on invitations for all to authenticated
  using (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()))
  with check (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()));

-- ---- feature flags: global (tenant null) readable by all; tenant flags scoped ----
alter table feature_flags enable row level security;
drop policy if exists flags_read on feature_flags;
create policy flags_read on feature_flags for select to authenticated
  using (tenant_id is null or public.is_super_admin() or tenant_id in (select public.my_tenant_ids()));
drop policy if exists flags_admin on feature_flags;
create policy flags_admin on feature_flags for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- ---- tenant_settings ----
alter table tenant_settings enable row level security;
drop policy if exists tsettings_tenant on tenant_settings;
create policy tsettings_tenant on tenant_settings for all to authenticated
  using (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()))
  with check (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()));

-- ---- all tenant-scoped content/ops tables: standard isolation policy ----
do $$
declare t text;
begin
  foreach t in array array[
    'projects','stories','scenes','series','pipeline_runs','pipeline_stages',
    'stage_versions','characters','character_versions','assets','prompts','voices',
    'style_profiles','render_jobs','api_usage','videos','prompt_cache','settings',
    'notifications','audit_log'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format($f$create policy tenant_isolation on %I for all to authenticated
      using (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()))
      with check (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()))$f$, t);
  end loop;
end $$;
