-- M13 S5 (remainder): data classification, retention, DLP, compliance evidence
-- and the Privacy Center. All rules-based and deterministic.

create table if not exists data_classifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,   -- NULL = platform default
  resource text not null,                    -- table/dataset name (e.g. stories, api_keys)
  level text not null default 'internal',    -- public|internal|confidential|restricted|secret
  handling jsonb not null default '{}',      -- {export:false, share:false, mask_fields:[...]}
  retention_days int,                        -- NULL = keep
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index if not exists uq_data_class_tenant on data_classifications (tenant_id, resource) where tenant_id is not null;
create unique index if not exists uq_data_class_platform on data_classifications (resource) where tenant_id is null;

-- Platform classification baseline for the data this product actually holds.
insert into data_classifications (tenant_id, resource, level, handling, retention_days) values
  (null, 'tenant_credentials', 'secret',       '{"export":false,"share":false}', null),
  (null, 'api_keys',           'secret',       '{"export":false,"share":false}', null),
  (null, 'security_audit',     'restricted',   '{"export":true,"share":false}', 3650),
  (null, 'audit_log',          'restricted',   '{"export":true,"share":false}', 730),
  (null, 'profiles',           'confidential', '{"export":true,"share":false,"mask_fields":["avatar"]}', null),
  (null, 'stories',            'internal',     '{"export":true,"share":true}', null),
  (null, 'analytics',          'internal',     '{"export":true,"share":true}', 1095)
on conflict do nothing;

-- DLP findings raised when an export/download would move sensitive data.
create table if not exists dlp_findings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  actor_id uuid,
  channel text not null,                     -- export|api|download|webhook
  resource text,
  rule text not null,                        -- secret_pattern|pii_email|pii_phone|classification_block
  severity text not null default 'warning',  -- info|warning|blocking
  action_taken text not null default 'flagged',  -- flagged|redacted|blocked
  evidence jsonb not null default '{}',      -- match counts + locations, never the raw secret
  created_at timestamptz default now()
);
create index if not exists idx_dlp_tenant on dlp_findings (tenant_id, created_at desc);

-- Privacy Center: subject requests with a real lifecycle.
create table if not exists privacy_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  user_id uuid,
  subject_email text,
  kind text not null,                        -- export|delete|rectify|consent_withdraw
  status text not null default 'received',   -- received|verifying|in_progress|completed|rejected
  legal_basis text,
  due_at timestamptz,                        -- statutory deadline (e.g. 30 days)
  completed_at timestamptz,
  handled_by uuid,
  notes text,
  artifact_ref text,                         -- export bundle reference when produced
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_privacy_requests_tenant on privacy_requests (tenant_id, status, created_at desc);

create table if not exists consent_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  user_id uuid,
  subject_email text,
  purpose text not null,                     -- terms|privacy|marketing|ai_processing|likeness
  granted boolean not null,
  version text,
  source text,                               -- onboarding|settings|api
  ip inet,
  created_at timestamptz default now()
);
create index if not exists idx_consent_tenant on consent_records (tenant_id, purpose, created_at desc);

-- Compliance evidence register (SOC2/ISO): control -> evidence pointer.
create table if not exists compliance_controls (
  id uuid primary key default gen_random_uuid(),
  framework text not null,                   -- soc2|iso27001|gdpr
  control_key text not null,
  title text not null,
  status text not null default 'implemented',  -- implemented|partial|not_applicable|gap
  evidence jsonb not null default '{}',      -- {tables:[...], policies:[...], notes:"..."}
  last_reviewed_at timestamptz,
  created_at timestamptz default now()
);
create unique index if not exists uq_compliance_controls on compliance_controls (framework, control_key);

-- Evidence for controls this implementation genuinely satisfies today.
insert into compliance_controls (framework, control_key, title, status, evidence) values
  ('soc2','CC6.1','Logical access controls','implemented','{"tables":["memberships","role_permissions","security_policies"],"notes":"RLS tenant isolation + RBAC + policy engine"}'),
  ('soc2','CC6.6','Least privilege / privileged access','implemented','{"tables":["privileged_grants"],"notes":"Time-boxed, approval-based PAM with separation of duties"}'),
  ('soc2','CC7.2','Security monitoring & detection','implemented','{"tables":["threat_findings","security_incidents"],"notes":"Rules-based detectors over audited signals"}'),
  ('soc2','CC7.3','Incident response','implemented','{"tables":["security_incidents"],"notes":"Incident lifecycle with timeline + resolution"}'),
  ('soc2','CC4.1','Audit logging & integrity','implemented','{"tables":["security_audit"],"notes":"Append-only hash-chained audit with verification function"}'),
  ('gdpr','Art.15','Right of access','implemented','{"tables":["privacy_requests"],"notes":"Export request lifecycle"}'),
  ('gdpr','Art.17','Right to erasure','implemented','{"tables":["privacy_requests"],"notes":"Deletion request lifecycle"}'),
  ('gdpr','Art.30','Records of processing','partial','{"tables":["consent_records","data_classifications"],"notes":"Consent + classification captured; sub-processor register pending"}'),
  ('iso27001','A.10.1','Cryptographic controls','partial','{"tables":["kms_keys","tenant_credentials"],"notes":"Vault envelope encryption + key lifecycle; BYOK requires an external KMS"}')
on conflict do nothing;

alter table data_classifications enable row level security;
drop policy if exists data_class_read on data_classifications;
create policy data_class_read on data_classifications for select to authenticated
  using (public.is_super_admin() or tenant_id is null or tenant_id in (select public.my_tenant_ids()));
drop policy if exists data_class_admin on data_classifications;
create policy data_class_admin on data_classifications for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

do $$
declare t text;
begin
  foreach t in array array['dlp_findings','privacy_requests','consent_records'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_read on %I', t);
    execute format($f$create policy tenant_read on %I for select to authenticated
      using (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()))$f$, t);
    execute format('drop policy if exists tenant_admin on %I', t);
    execute format($f$create policy tenant_admin on %I for all to authenticated
      using (public.is_super_admin()) with check (public.is_super_admin())$f$, t);
  end loop;
end $$;

alter table compliance_controls enable row level security;
drop policy if exists compliance_read on compliance_controls;
create policy compliance_read on compliance_controls for select to authenticated using (true);
drop policy if exists compliance_admin on compliance_controls;
create policy compliance_admin on compliance_controls for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
