-- Second round of audit fixes: a cross-tenant WRITE through a SECURITY DEFINER
-- RPC, plus the role boundaries that RLS was not enforcing.

-- ============ P0: append_stage_version() had no tenant check ============
-- Migration 035 revoked this function from `public, anon, authenticated`.
-- Migration 036 had to drop and recreate it to add the model/cost arguments and
-- re-granted EXECUTE to `authenticated` so the app client could call it — but a
-- SECURITY DEFINER function runs as its owner and bypasses RLS, and this one
-- looked up the stage by id with no ownership test.
--
-- Verified exploitable against the live database: a user of tenant B, who could
-- not even SELECT the row, overwrote tenant A's `pipeline_stages.output` and
-- moved its `active_version_id` — injecting content that flows to A's publish
-- stage and out to A's channel. Stage ids are not secret; they appear in review
-- links and notifications.
--
-- The caller check must happen INSIDE the function, because that is the only
-- place that still knows who called it.
create or replace function public.append_stage_version(
  p_stage_id uuid,
  p_output jsonb,
  p_kind text default 'ai_generated',
  p_created_by uuid default null,
  p_source_version_id uuid default null,
  p_note text default null,
  p_model text default null,
  p_cost_usd numeric default null
) returns stage_versions
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_stage pipeline_stages;
  v_next int;
  v_row stage_versions;
begin
  -- Lock the stage so concurrent edits can't compute the same version number.
  select * into v_stage from pipeline_stages where id = p_stage_id for update;
  if not found then
    raise exception 'stage % not found', p_stage_id using errcode = 'no_data_found';
  end if;

  -- The caller must own the stage. `auth.uid() is null` means the service role
  -- or a direct server-side connection: job workers legitimately write stages
  -- for any tenant, and they take the tenant from the claimed job row.
  -- The error deliberately matches the not-found message so this is not an
  -- existence oracle for stage ids belonging to other tenants.
  if auth.uid() is not null
     and not public.is_super_admin()
     and v_stage.tenant_id not in (select public.my_tenant_ids()) then
    raise exception 'stage % not found', p_stage_id using errcode = 'no_data_found';
  end if;

  if p_kind not in ('ai_generated', 'human_edited', 'regenerated', 'restored') then
    raise exception 'invalid version kind %', p_kind using errcode = 'check_violation';
  end if;

  select coalesce(max(version), 0) + 1 into v_next from stage_versions where stage_id = p_stage_id;

  insert into stage_versions (
    tenant_id, stage_id, version, output, kind, created_by, source_version_id,
    checksum, note, immutable, model, cost_usd
  ) values (
    v_stage.tenant_id, p_stage_id, v_next, p_output, p_kind, p_created_by, p_source_version_id,
    encode(digest(coalesce(p_output::text, ''), 'sha256'), 'hex'), p_note, true, p_model, p_cost_usd
  ) returning * into v_row;

  -- The live output and the active pointer move together, in one transaction.
  update pipeline_stages
     set output = p_output, active_version_id = v_row.id, updated_at = now()
   where id = p_stage_id;

  return v_row;
end;
$$;

revoke all on function public.append_stage_version(uuid, jsonb, text, uuid, uuid, text, text, numeric)
  from public, anon;
grant execute on function public.append_stage_version(uuid, jsonb, text, uuid, uuid, text, text, numeric)
  to authenticated, service_role;

-- ============ P1: role boundaries that RLS was not enforcing ============
-- Tenant policies were uniformly `tenant_id in my_tenant_ids()`, i.e. they knew
-- about MEMBERSHIP but not about ROLE. Role checks lived only in server actions,
-- so a `client_viewer` talking to PostgREST directly with their own JWT could do
-- what the UI forbids. This adds the missing dimension for the surfaces where
-- the gap is actually exploitable.
create or replace function public.is_tenant_manager(p_tenant uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_super_admin from profiles where user_id = auth.uid()), false)
      or exists (
        select 1 from memberships m
         where m.tenant_id = p_tenant
           and m.user_id = auth.uid()
           and m.status = 'active'
           and m.role in ('client_owner', 'client_manager'));
$$;
revoke all on function public.is_tenant_manager(uuid) from public, anon;
grant execute on function public.is_tenant_manager(uuid) to authenticated, service_role;

-- API keys ARE credentials. Every legitimate write already goes through the
-- service-role client (app/(dashboard)/api-management/actions.ts), so members
-- get read-only access and cannot mint a key with '*' scopes by inserting one
-- directly with a key_hash they chose.
drop policy if exists tenant_isolation on api_keys;
create policy api_keys_read on api_keys for select to authenticated
  using (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()));
create policy api_keys_admin_write on api_keys for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- Webhook endpoints hold a signing secret that lets the holder forge signed
-- deliveries. Members may see that an endpoint exists; only managers may change
-- one (which is what the /developer UI already requires).
drop policy if exists tenant_isolation on webhook_endpoints;
create policy webhook_endpoints_read on webhook_endpoints for select to authenticated
  using (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()));
create policy webhook_endpoints_manage on webhook_endpoints for all to authenticated
  using (public.is_tenant_manager(tenant_id))
  with check (public.is_tenant_manager(tenant_id));

-- `schedules.emergency_stop` is the workspace kill switch. /automation gated it
-- behind isOwnerOrManager; /schedule wrote the same column with no role check,
-- so a viewer could lift a stop from the other screen.
drop policy if exists tenant_isolation on schedules;
create policy schedules_read on schedules for select to authenticated
  using (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()));
create policy schedules_manage on schedules for all to authenticated
  using (public.is_tenant_manager(tenant_id))
  with check (public.is_tenant_manager(tenant_id));

-- Workspace settings drive automation behaviour and spend.
drop policy if exists tsettings_tenant on tenant_settings;
create policy tenant_settings_read on tenant_settings for select to authenticated
  using (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()));
create policy tenant_settings_manage on tenant_settings for all to authenticated
  using (public.is_tenant_manager(tenant_id))
  with check (public.is_tenant_manager(tenant_id));

-- ============ P2: policies that also applied to `anon` ============
-- A policy written `for all` with no `to` clause applies to every role including
-- `anon`. Combined with `or tenant_id is null` for platform baselines, the
-- public anon key could read platform playbooks and SLA targets with no login.
drop policy if exists tenant_isolation on ops_playbooks;
create policy tenant_isolation on ops_playbooks for all to authenticated
  using (public.is_super_admin() or tenant_id is null or tenant_id in (select public.my_tenant_ids()))
  with check (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()));

drop policy if exists tenant_isolation on ops_playbook_versions;
create policy tenant_isolation on ops_playbook_versions for all to authenticated
  using (public.is_super_admin() or exists (
    select 1 from ops_playbooks p where p.id = playbook_id
      and (p.tenant_id is null or p.tenant_id in (select public.my_tenant_ids()))))
  with check (public.is_super_admin() or exists (
    select 1 from ops_playbooks p where p.id = playbook_id
      and p.tenant_id in (select public.my_tenant_ids())));

drop policy if exists tenant_isolation on sla_definitions;
create policy tenant_isolation on sla_definitions for all to authenticated
  using (public.is_super_admin() or tenant_id is null or tenant_id in (select public.my_tenant_ids()))
  with check (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()));

drop policy if exists tenant_isolation on ops_playbook_runs;
create policy tenant_isolation on ops_playbook_runs for all to authenticated
  using (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()))
  with check (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()));

drop policy if exists tenant_isolation on comments;
create policy tenant_isolation on comments for all to authenticated
  using (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()))
  with check (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()));

drop policy if exists tenant_isolation on comment_mentions;
create policy tenant_isolation on comment_mentions for all to authenticated
  using (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()))
  with check (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()));

drop policy if exists own_preferences on notification_preferences;
create policy own_preferences on notification_preferences for all to authenticated
  using (public.is_super_admin() or (user_id = auth.uid() and tenant_id in (select public.my_tenant_ids())))
  with check (public.is_super_admin() or (user_id = auth.uid() and tenant_id in (select public.my_tenant_ids())));
