-- M12 G1: unified, versioned, governed tenant Asset Library (ADR-041 / ADR-049).
-- ONE library for prompt templates, characters, style packs, brand voices and
-- voice profiles — instead of five ad-hoc versioning schemes. Guarantees:
--   * immutable versions (enforced by trigger once approved/published)
--   * exactly ONE active version per item (single FK column, by construction)
--   * explicit governance state (draft -> in_review -> approved -> archived)
--   * copy-on-use provenance (origin_item_id)
-- Legacy `prompts`/`characters`/`style_profiles`/`voices` tables are left in
-- place (their read-only pages keep working); the library is the governed
-- source of truth going forward and is backfilled from them below.

create table if not exists asset_library_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  kind text not null,                 -- prompt_template|character|style_pack|brand_voice|voice_profile
  key text not null,                  -- stable slug within (tenant, kind)
  name text not null,
  description text,
  active_version_id uuid,             -- exactly one active version (see FK below)
  governance_state text not null default 'draft',   -- draft|in_review|approved|archived
  origin_item_id uuid,                -- copy-on-use provenance
  tags text[] not null default '{}',
  created_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index if not exists uq_asset_items_tenant_kind_key
  on asset_library_items (tenant_id, kind, key);
create index if not exists idx_asset_items_tenant_kind on asset_library_items (tenant_id, kind);

create table if not exists asset_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  item_id uuid not null references asset_library_items(id) on delete cascade,
  version int not null,
  body jsonb not null default '{}',   -- the versioned payload (template+vars, descriptor, style config, voice config)
  checksum text,
  state text not null default 'draft',        -- draft|approved|published|archived
  immutable boolean not null default false,   -- set when approved/published; blocks content edits
  notes text,
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz default now()
);
create unique index if not exists uq_asset_versions_item_version on asset_versions (item_id, version);
create index if not exists idx_asset_versions_tenant on asset_versions (tenant_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'asset_items_active_version_fk') then
    alter table asset_library_items
      add constraint asset_items_active_version_fk
      foreign key (active_version_id) references asset_versions(id) on delete set null;
  end if;
end $$;

-- Relations between assets: character -> voice_profile, character -> style_pack,
-- item -> brand_voice. Drives continuity/binding (ADR-041 §7).
create table if not exists asset_bindings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  item_id uuid not null references asset_library_items(id) on delete cascade,
  bound_item_id uuid not null references asset_library_items(id) on delete cascade,
  relation text not null,             -- voice|style|brand_voice
  created_at timestamptz default now()
);
create unique index if not exists uq_asset_bindings on asset_bindings (item_id, bound_item_id, relation);

-- ---- Version immutability (real DB-level guarantee, not a convention) ----
create or replace function public.enforce_asset_version_immutability()
returns trigger language plpgsql as $$
begin
  if old.immutable then
    if new.body is distinct from old.body
       or new.version is distinct from old.version
       or new.checksum is distinct from old.checksum
       or new.item_id is distinct from old.item_id then
      raise exception 'asset_versions %: immutable version cannot be modified', old.id
        using errcode = 'check_violation';
    end if;
    -- archiving an immutable version stays allowed
    if new.immutable = false then
      raise exception 'asset_versions %: immutability cannot be revoked', old.id
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_asset_version_immutability on asset_versions;
create trigger trg_asset_version_immutability
  before update on asset_versions
  for each row execute function public.enforce_asset_version_immutability();

-- Standard tenant isolation (same shape as migration 004).
do $$
declare t text;
begin
  foreach t in array array['asset_library_items','asset_versions','asset_bindings'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format($f$create policy tenant_isolation on %I for all to authenticated
      using (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()))
      with check (public.is_super_admin() or tenant_id in (select public.my_tenant_ids()))$f$, t);
  end loop;
end $$;

-- ---- Backfill: bring existing characters/voices into the governed library ----
-- Idempotent and additive; legacy tables are NOT modified or dropped.
do $$
declare r record; new_item uuid; new_ver uuid;
begin
  for r in
    select c.id, c.tenant_id, c.name, c.descriptor, c.role, c.gender, c.ethnicity, c.seed
    from characters c
    where c.tenant_id is not null
  loop
    if not exists (
      select 1 from asset_library_items
      where tenant_id = r.tenant_id and kind = 'character'
        and key = 'char-' || replace(r.id::text, '-', '')
    ) then
      insert into asset_library_items(tenant_id, kind, key, name, description, governance_state)
      values (r.tenant_id, 'character', 'char-' || replace(r.id::text, '-', ''),
              coalesce(r.name, 'Character'), 'Imported from legacy characters table', 'approved')
      returning id into new_item;

      insert into asset_versions(tenant_id, item_id, version, body, state, immutable, notes)
      values (r.tenant_id, new_item, 1,
              jsonb_strip_nulls(jsonb_build_object(
                'descriptor', r.descriptor, 'role', r.role, 'gender', r.gender,
                'ethnicity', r.ethnicity, 'seed', r.seed, 'legacy_character_id', r.id)),
              'published', true, 'Backfilled from characters')
      returning id into new_ver;

      update asset_library_items set active_version_id = new_ver where id = new_item;
    end if;
  end loop;

  for r in
    select v.id, v.tenant_id, v.name, v.provider, v.voice_id, v.language, v.settings
    from voices v
    where v.tenant_id is not null
  loop
    if not exists (
      select 1 from asset_library_items
      where tenant_id = r.tenant_id and kind = 'voice_profile'
        and key = 'voice-' || replace(r.id::text, '-', '')
    ) then
      insert into asset_library_items(tenant_id, kind, key, name, description, governance_state)
      values (r.tenant_id, 'voice_profile', 'voice-' || replace(r.id::text, '-', ''),
              coalesce(r.name, 'Voice'), 'Imported from legacy voices table', 'approved')
      returning id into new_item;

      insert into asset_versions(tenant_id, item_id, version, body, state, immutable, notes)
      values (r.tenant_id, new_item, 1,
              jsonb_strip_nulls(jsonb_build_object(
                'provider', r.provider, 'voice_id', r.voice_id, 'language', r.language,
                'settings', r.settings, 'legacy_voice_id', r.id)),
              'published', true, 'Backfilled from voices')
      returning id into new_ver;

      update asset_library_items set active_version_id = new_ver where id = new_item;
    end if;
  end loop;
end $$;
