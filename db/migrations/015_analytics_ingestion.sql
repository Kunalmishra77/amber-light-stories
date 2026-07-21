-- M10 / ISS-P3-05 (v1.0 loop step 7): real analytics ingestion.
-- The legacy `analytics` table (schema.sql) is per-video but has NO tenant_id,
-- NO RLS, no daily granularity, and no idempotency key. Extend it (additive)
-- into a tenant-scoped, idempotent daily-snapshot store — provider-abstracted
-- so future platforms reuse the same domain.

alter table analytics add column if not exists tenant_id uuid references tenants(id);
alter table analytics add column if not exists provider text default 'youtube';
alter table analytics add column if not exists external_video_id text;
alter table analytics add column if not exists period_date date;              -- day the metrics cover (idempotency dimension)
alter table analytics add column if not exists impressions int;
alter table analytics add column if not exists likes int;
alter table analytics add column if not exists comments int;
alter table analytics add column if not exists estimated_minutes_watched numeric;
-- Provenance: 'live' = real YouTube Analytics API; 'dry' = deterministic test
-- fixture (never presented as real). Explicit so the UI can label it.
alter table analytics add column if not exists source text default 'live';
alter table analytics add column if not exists ingested_at timestamptz default now();

create index if not exists idx_analytics_tenant on analytics (tenant_id);
-- Idempotency: at most ONE row per (video, day). Repeated ingestion upserts.
-- Partial (period_date not null) so any legacy null-date rows are untouched.
create unique index if not exists uq_analytics_video_period
  on analytics (video_id, period_date) where period_date is not null;

alter table analytics enable row level security;
drop policy if exists tenant_isolation on analytics;
create policy tenant_isolation on analytics for all to authenticated
  using (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()))
  with check (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()));
