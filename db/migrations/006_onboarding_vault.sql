-- S3 Onboarding + encrypted credential vault (Supabase Vault / pgsodium).

create table if not exists onboarding (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  status text default 'created',   -- created|in_progress|submitted|approved|rejected|changes_requested
  business_info jsonb default '{}',
  api_status jsonb default '{}',   -- {provider: connected|invalid|expired|...}
  link_token text unique default replace(gen_random_uuid()::text,'-',''),
  owner_email text,
  submitted_at timestamptz, reviewed_by uuid, reviewed_at timestamptz, notes text,
  created_at timestamptz default now()
);

create table if not exists tenant_credentials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  provider text not null,          -- openai|gemini|elevenlabs|youtube|gmail|fal
  secret_ref uuid,                 -- -> vault secret id (the actual key lives encrypted in Vault)
  status text default 'connected', -- connected|invalid|expired|missing_permission|quota_exceeded
  meta jsonb default '{}',
  last_checked_at timestamptz, updated_at timestamptz default now(),
  unique (tenant_id, provider)
);

-- 'channels' already exists from v1 (id,name,yt_channel_id,config,created_at) — extend it.
alter table channels add column if not exists tenant_id uuid references tenants(id);
alter table channels add column if not exists provider text default 'youtube';
alter table channels add column if not exists external_channel_id text;
alter table channels add column if not exists title text;
alter table channels add column if not exists oauth_ref uuid;
alter table channels add column if not exists status text default 'connected';
update channels set tenant_id = (select id from tenants where slug='default') where tenant_id is null;

-- ---- Vault-backed credential store/read (service-role only) ----
create or replace function public.store_credential(p_tenant uuid, p_provider text, p_secret text, p_meta jsonb default '{}')
returns void language plpgsql security definer set search_path = public, vault as $$
declare v_ref uuid;
begin
  select secret_ref into v_ref from tenant_credentials where tenant_id = p_tenant and provider = p_provider;
  if v_ref is null then
    v_ref := vault.create_secret(p_secret, 'cred_'||p_tenant||'_'||p_provider, 'tenant credential');
    insert into tenant_credentials(tenant_id, provider, secret_ref, status, meta, last_checked_at)
      values (p_tenant, p_provider, v_ref, 'connected', p_meta, now());
  else
    perform vault.update_secret(v_ref, p_secret);
    update tenant_credentials set meta = p_meta, updated_at = now(), last_checked_at = now()
      where tenant_id = p_tenant and provider = p_provider;
  end if;
end $$;

create or replace function public.get_credential(p_tenant uuid, p_provider text)
returns text language sql security definer set search_path = public, vault stable as $$
  select decrypted_secret from vault.decrypted_secrets
  where id = (select secret_ref from tenant_credentials where tenant_id = p_tenant and provider = p_provider);
$$;

-- lock down: only service_role may store/read raw secrets
revoke execute on function public.store_credential(uuid,text,text,jsonb) from public, anon, authenticated;
revoke execute on function public.get_credential(uuid,text) from public, anon, authenticated;

-- ---- RLS ----
alter table onboarding enable row level security;
drop policy if exists onboarding_access on onboarding;
create policy onboarding_access on onboarding for all to authenticated
  using (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()))
  with check (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()));

alter table tenant_credentials enable row level security;
drop policy if exists cred_read on tenant_credentials;   -- status/meta only; secret is in Vault, never here
create policy cred_read on tenant_credentials for select to authenticated
  using (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()));
drop policy if exists cred_admin on tenant_credentials;
create policy cred_admin on tenant_credentials for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

alter table channels enable row level security;
drop policy if exists channels_tenant on channels;
create policy channels_tenant on channels for all to authenticated
  using (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()))
  with check (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()));
