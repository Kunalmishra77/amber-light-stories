-- M13 S5 (audit foundation) — ADR-052: immutable, hash-chained security audit.
--
-- FIXES AN ACTIVE SECURITY GAP: `audit_log` carried a FOR ALL tenant_isolation
-- policy, which let a tenant member UPDATE or DELETE their own audit rows.
-- That is replaced below with INSERT+SELECT only (no UPDATE/DELETE for any
-- authenticated user), plus a trigger that hard-blocks UPDATE.
--
-- `security_audit` is the tamper-EVIDENT store: every row is chained to the
-- previous row for its tenant with sha256(prev_hash || canonical(payload)).
-- The chain is computed by a DB TRIGGER, so a writer cannot forge it, and
-- UPDATE is impossible. DELETE is blocked unless the session explicitly sets
-- `app.audit_purge='on'` — the sanctioned path for the RETENTION job required
-- by ADR-052 (and the only way test data can be removed).

create table if not exists security_audit (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,   -- NULL = platform-plane event
  seq bigint not null,                     -- per-chain sequence (tenant or platform)
  actor_id uuid,
  actor_type text not null default 'user', -- user|service_account|api_key|system
  action text not null,
  target text,
  severity text not null default 'info',   -- info|warning|critical
  meta jsonb not null default '{}',
  ip inet,
  user_agent text,
  prev_hash text,
  hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_security_audit_tenant_seq on security_audit (tenant_id, seq desc);
create index if not exists idx_security_audit_created on security_audit (created_at desc);
create index if not exists idx_security_audit_action on security_audit (action);

-- Chain builder. Runs BEFORE INSERT so seq/prev_hash/hash can never be supplied
-- (or forged) by the caller.
create or replace function public.build_security_audit_chain()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare prev record; payload text;
begin
  select seq, hash into prev
  from security_audit
  where tenant_id is not distinct from new.tenant_id
  order by seq desc
  limit 1;

  new.seq := coalesce(prev.seq, 0) + 1;
  new.prev_hash := prev.hash;              -- NULL for the genesis row of a chain

  -- Canonical payload: every field that matters for tamper-evidence.
  payload := coalesce(new.prev_hash, '') || '|' ||
             new.seq::text || '|' ||
             coalesce(new.tenant_id::text, '') || '|' ||
             coalesce(new.actor_id::text, '') || '|' ||
             new.actor_type || '|' ||
             new.action || '|' ||
             coalesce(new.target, '') || '|' ||
             new.severity || '|' ||
             coalesce(new.meta::text, '{}') || '|' ||
             extract(epoch from new.created_at)::text;

  new.hash := encode(digest(payload, 'sha256'), 'hex');
  return new;
end;
$$;
drop trigger if exists trg_security_audit_chain on security_audit;
create trigger trg_security_audit_chain
  before insert on security_audit
  for each row execute function public.build_security_audit_chain();

-- Immutability: UPDATE never allowed; DELETE only under the sanctioned
-- retention/purge flag (ADR-052 requires configurable retention).
create or replace function public.enforce_security_audit_immutability()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'security_audit is append-only: rows can never be modified'
      using errcode = 'check_violation';
  end if;
  if tg_op = 'DELETE' then
    if coalesce(current_setting('app.audit_purge', true), 'off') <> 'on' then
      raise exception 'security_audit is append-only: deletion requires the sanctioned retention purge'
        using errcode = 'check_violation';
    end if;
    -- Sanctioned purge: return OLD so the delete proceeds. (Returning NULL in a
    -- BEFORE row trigger silently CANCELS the operation — that would have made
    -- retention a no-op while appearing to succeed.)
    return old;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_security_audit_no_update on security_audit;
create trigger trg_security_audit_no_update
  before update on security_audit
  for each row execute function public.enforce_security_audit_immutability();
drop trigger if exists trg_security_audit_no_delete on security_audit;
create trigger trg_security_audit_no_delete
  before delete on security_audit
  for each row execute function public.enforce_security_audit_immutability();

-- Visibility is tenant-scoped; NO authenticated writes at all (the engine
-- writes via the service role, so a user can never author an audit entry).
alter table security_audit enable row level security;
drop policy if exists security_audit_read on security_audit;
create policy security_audit_read on security_audit for select to authenticated
  using (public.is_super_admin() or (tenant_id is not null and tenant_id in (select public.my_tenant_ids())));

-- Chain verification: walks a chain in order and recomputes every hash.
create or replace function public.verify_security_audit_chain(p_tenant uuid default null)
returns table(ok boolean, checked bigint, first_bad_seq bigint, reason text)
language plpgsql stable security definer set search_path = public, extensions as $$
declare r record; expected text; prev text := null; n bigint := 0;
begin
  for r in
    select * from security_audit
    where tenant_id is not distinct from p_tenant
    order by seq asc
  loop
    n := n + 1;
    if r.prev_hash is distinct from prev then
      ok := false; checked := n; first_bad_seq := r.seq; reason := 'prev_hash link mismatch';
      return next; return;
    end if;
    expected := encode(digest(
      coalesce(r.prev_hash,'') || '|' || r.seq::text || '|' ||
      coalesce(r.tenant_id::text,'') || '|' || coalesce(r.actor_id::text,'') || '|' ||
      r.actor_type || '|' || r.action || '|' || coalesce(r.target,'') || '|' ||
      r.severity || '|' || coalesce(r.meta::text,'{}') || '|' ||
      extract(epoch from r.created_at)::text, 'sha256'), 'hex');
    if expected is distinct from r.hash then
      ok := false; checked := n; first_bad_seq := r.seq; reason := 'row hash mismatch (content altered)';
      return next; return;
    end if;
    prev := r.hash;
  end loop;
  ok := true; checked := n; first_bad_seq := null; reason := 'chain intact';
  return next;
end;
$$;
revoke all on function public.verify_security_audit_chain(uuid) from public, anon;

-- ---- FIX: harden the existing audit_log (was FOR ALL = tamper-able) ----
alter table audit_log enable row level security;
drop policy if exists tenant_isolation on audit_log;
drop policy if exists audit_log_read on audit_log;
create policy audit_log_read on audit_log for select to authenticated
  using (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()));
drop policy if exists audit_log_insert on audit_log;
create policy audit_log_insert on audit_log for insert to authenticated
  with check (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()));
-- deliberately NO update/delete policy: tenant users can neither alter nor
-- remove audit entries. (The service role retains delete for retention.)

create or replace function public.block_audit_log_update()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_log is append-only: entries cannot be modified'
    using errcode = 'check_violation';
end;
$$;
drop trigger if exists trg_audit_log_no_update on audit_log;
create trigger trg_audit_log_no_update
  before update on audit_log
  for each row execute function public.block_audit_log_update();
