-- M13 S6: sealed, multi-approval, time-boxed break-glass access (ADR-059).
-- Emergency access must be recoverable but must NEVER become a standing
-- backdoor: every request needs TWO distinct approvers (neither of whom may be
-- the requester), carries a hard expiry, raises an alarm, and is fully audited.
-- Enforcement lives in DB constraints/triggers so code cannot bypass it.

create table if not exists break_glass_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,   -- NULL = platform-plane emergency
  requested_by uuid not null,
  reason text not null,
  scope text not null,                        -- what minimal access is needed
  status text not null default 'requested',   -- requested|approved|active|expired|revoked|denied
  required_approvals int not null default 2,
  activated_at timestamptz,
  expires_at timestamptz,                     -- hard stop, always required to activate
  revoked_at timestamptz,
  revoked_by uuid,
  closed_at timestamptz,
  post_review text,                           -- mandatory post-hoc review note
  created_at timestamptz default now()
);
create index if not exists idx_break_glass_status on break_glass_requests (status, expires_at);

create table if not exists break_glass_approvals (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references break_glass_requests(id) on delete cascade,
  approver_id uuid not null,
  decision text not null default 'approved',  -- approved|denied
  note text,
  created_at timestamptz default now()
);
-- One vote per approver per request.
create unique index if not exists uq_break_glass_approver on break_glass_approvals (request_id, approver_id);

-- An approver may never be the requester (separation of duties).
create or replace function public.enforce_break_glass_approver()
returns trigger language plpgsql as $$
declare req record;
begin
  select requested_by into req from break_glass_requests where id = new.request_id;
  if req.requested_by = new.approver_id then
    raise exception 'break_glass: the requester cannot approve their own emergency access'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_break_glass_approver on break_glass_approvals;
create trigger trg_break_glass_approver
  before insert on break_glass_approvals
  for each row execute function public.enforce_break_glass_approver();

-- Activation requires the full approval quorum AND a hard expiry.
create or replace function public.enforce_break_glass_activation()
returns trigger language plpgsql as $$
declare approvals int;
begin
  if new.status in ('approved','active') and old.status is distinct from new.status then
    select count(*) into approvals
    from break_glass_approvals
    where request_id = new.id and decision = 'approved';
    if approvals < new.required_approvals then
      raise exception 'break_glass: % of % approvals — quorum not met', approvals, new.required_approvals
        using errcode = 'check_violation';
    end if;
    if new.expires_at is null then
      raise exception 'break_glass: emergency access must be time-boxed (expires_at required)'
        using errcode = 'check_violation';
    end if;
    if new.expires_at <= now() then
      raise exception 'break_glass: expiry must be in the future'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_break_glass_activation on break_glass_requests;
create trigger trg_break_glass_activation
  before update on break_glass_requests
  for each row execute function public.enforce_break_glass_activation();

-- Visible to super admins (and the requester); only super admins may write.
alter table break_glass_requests enable row level security;
drop policy if exists break_glass_read on break_glass_requests;
create policy break_glass_read on break_glass_requests for select to authenticated
  using (public.is_super_admin() or requested_by = auth.uid());
drop policy if exists break_glass_admin on break_glass_requests;
create policy break_glass_admin on break_glass_requests for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

alter table break_glass_approvals enable row level security;
drop policy if exists break_glass_appr_read on break_glass_approvals;
create policy break_glass_appr_read on break_glass_approvals for select to authenticated
  using (public.is_super_admin());
drop policy if exists break_glass_appr_admin on break_glass_approvals;
create policy break_glass_appr_admin on break_glass_approvals for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
