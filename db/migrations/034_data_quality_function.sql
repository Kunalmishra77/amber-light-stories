-- M14 B6: data-quality checks as a FIXED server-side function.
--
-- Deliberately NOT a generic `exec_sql(text)` RPC: accepting arbitrary SQL from
-- the application — even service-role-only — creates an injection/abuse surface
-- and a privilege-escalation path. Every query below is hardcoded here, so the
-- app can only ask "run the checks", never "run this SQL".

create or replace function public.run_data_quality_checks()
returns table(check_key text, resource text, severity text, violations bigint, description text)
language plpgsql stable security definer set search_path = public as $$
begin
  return query
  select 'missing_tenant'::text, 'metadata'::text, 'warning'::text,
         (select count(*) from metadata where tenant_id is null),
         'Legacy metadata rows with no owning tenant (invisible under RLS)'::text
  union all
  select 'missing_tenant', 'scripts', 'warning',
         (select count(*) from scripts where tenant_id is null),
         'Legacy script rows with no owning tenant (invisible under RLS)'
  union all
  select 'orphan_reference', 'pipeline_stages', 'critical',
         (select count(*) from pipeline_stages s where s.run_id is not null
            and not exists (select 1 from pipeline_runs r where r.id = s.run_id)),
         'Pipeline stages whose run no longer exists'
  union all
  select 'orphan_reference', 'scenes', 'warning',
         (select count(*) from scenes sc where sc.story_id is not null
            and not exists (select 1 from stories st where st.id = sc.story_id)),
         'Scenes whose story no longer exists'
  union all
  -- The outbox durability invariant, continuously asserted.
  select 'integrity', 'event_outbox', 'critical',
         (select count(*) from videos v where v.status = 'published'
            and not exists (select 1 from event_outbox o
                            where o.aggregate_id = v.id and o.event_type = 'video.published')),
         'Published videos missing their outbox event (durability breach)'
  union all
  select 'drift', 'rls', 'critical',
         (select count(*) from pg_tables t where t.schemaname = 'public' and t.rowsecurity
            and not exists (select 1 from pg_policies p where p.tablename = t.tablename)),
         'Tables with RLS enabled but no policy (deny-all and unscoped)'
  union all
  select 'drift', 'domain_ownership', 'warning',
         (select count(distinct c.table_name) from information_schema.columns c
            where c.table_schema = 'public' and c.column_name = 'tenant_id'
              and not exists (select 1 from domain_tables d where d.table_name = c.table_name)),
         'Tenant-scoped tables with no declared owning domain'
  union all
  select 'duplicate', 'idempotency_keys', 'warning',
         (select count(*) from idempotency_keys
            where status = 'in_progress' and created_at < now() - interval '1 day'),
         'Stale in-progress idempotency claims';
end;
$$;
revoke all on function public.run_data_quality_checks() from public, anon, authenticated;

-- Record this migration in the schema-evolution registry (ADR-076).
insert into schema_migrations_registry (migration, phase, additive, breaking, notes) values
  ('031_event_backbone.sql','expand',true,false,'Outbox, idempotency store, event registry'),
  ('032_correlation_and_legacy_rls.sql','expand',true,false,'Correlation IDs; metadata/scripts scoped + policied'),
  ('033_domains_config_governance.sql','expand',true,false,'Domains, config service, storage/search/cache, governance'),
  ('034_data_quality_function.sql','expand',true,false,'Fixed data-quality check function')
on conflict do nothing;
