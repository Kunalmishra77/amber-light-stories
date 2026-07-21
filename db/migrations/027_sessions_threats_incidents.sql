-- M13 S3: session/device inventory, explainable threat detection, incidents.
-- ADR-055 (mid-session trust revocation), ADR-058 (explainable detection).
-- Detectors run as M11 durable jobs over signals the platform ALREADY audits —
-- no external intelligence feed, nothing invented.

create table if not exists user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  tenant_id uuid references tenants(id) on delete cascade,
  session_token_hash text,                  -- sha256 of the session ref; never the token
  device_fingerprint text,                  -- stable client hash (UA + platform + accept-lang)
  ip inet,
  user_agent text,
  status text not null default 'active',    -- active|revoked|expired
  trust_level text not null default 'normal',  -- normal|elevated|untrusted (zero-trust)
  last_seen_at timestamptz default now(),
  revoked_at timestamptz,
  revoked_by uuid,
  revoked_reason text,
  created_at timestamptz default now()
);
create index if not exists idx_user_sessions_user on user_sessions (user_id, status);
create index if not exists idx_user_sessions_tenant on user_sessions (tenant_id);

create table if not exists trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  device_fingerprint text not null,
  label text,
  trusted boolean not null default false,
  first_seen_at timestamptz default now(),
  last_seen_at timestamptz default now(),
  approved_at timestamptz,
  created_at timestamptz default now()
);
create unique index if not exists uq_trusted_devices on trusted_devices (user_id, device_fingerprint);

-- Explainable detector output: what fired, on what evidence, how severe.
create table if not exists threat_findings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  user_id uuid,
  detector text not null,                   -- brute_force|credential_stuffing|api_abuse|secret_abuse|privilege_escalation|abnormal_automation|new_device
  severity text not null default 'warning', -- info|warning|critical
  title text not null,
  evidence jsonb not null default '{}',     -- the exact signals that triggered it
  recommended_action text,
  status text not null default 'open',      -- open|acknowledged|resolved|false_positive
  incident_id uuid,
  detected_at timestamptz default now(),
  resolved_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists idx_threat_findings_tenant on threat_findings (tenant_id, status, detected_at desc);

create table if not exists security_incidents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  title text not null,
  severity text not null default 'medium',  -- low|medium|high|critical
  status text not null default 'open',      -- open|investigating|contained|resolved|closed
  summary text,
  assigned_to uuid,
  acknowledged_by uuid,
  acknowledged_at timestamptz,
  resolved_by uuid,
  resolved_at timestamptz,
  resolution text,
  timeline jsonb not null default '[]',     -- append-only event list (who/what/when)
  created_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_incidents_tenant on security_incidents (tenant_id, status, created_at desc);

do $$
begin
  if not exists (select 1 from pg_constraint where conname='threat_findings_incident_fk') then
    alter table threat_findings add constraint threat_findings_incident_fk
      foreign key (incident_id) references security_incidents(id) on delete set null;
  end if;
end $$;

-- Sessions/devices are personal; findings/incidents are tenant-scoped and
-- operator-managed (writes are service-role/super-admin only).
alter table user_sessions enable row level security;
drop policy if exists user_sessions_own on user_sessions;
create policy user_sessions_own on user_sessions for select to authenticated
  using (public.is_super_admin() or user_id = auth.uid());
drop policy if exists user_sessions_admin on user_sessions;
create policy user_sessions_admin on user_sessions for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

alter table trusted_devices enable row level security;
drop policy if exists trusted_devices_own on trusted_devices;
create policy trusted_devices_own on trusted_devices for all to authenticated
  using (public.is_super_admin() or user_id = auth.uid())
  with check (public.is_super_admin() or user_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['threat_findings','security_incidents'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists sec_read on %I', t);
    execute format($f$create policy sec_read on %I for select to authenticated
      using (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()))$f$, t);
    execute format('drop policy if exists sec_admin on %I', t);
    execute format($f$create policy sec_admin on %I for all to authenticated
      using (public.is_super_admin()) with check (public.is_super_admin())$f$, t);
  end loop;
end $$;
