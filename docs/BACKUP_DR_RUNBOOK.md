# Backup & Disaster Recovery Runbook

**Status: PARTIALLY VERIFIED.** The backup path is tested and working. A live
restore into a target instance has **not** been executed — it requires an owner
to provision a target database (see [Owner actions](#owner-actions-required)).
Nothing in this document assumes a capability that has not been checked.

Last verified: 2026-07-22 against the production Supabase project.

---

## 1. What actually exists today

| Capability | State | Evidence |
|---|---|---|
| WAL archiving | **Active** | `archive_mode=on`, `wal_level=logical`, `pg_stat_archiver` = 307 segments archived, last at 2026-07-22 15:28 UTC, **0 failures** |
| Logical backup (`pg_dump`) | **Tested, working** | 0.49 MB custom-format archive produced in **19.4 s** |
| Backup archive integrity | **Verified** | `pg_restore --list` → 246 tables, 172 policies, 169 indexes, 169 FKs, 144 constraints, 123 row-security enables, 41 functions, 30 triggers |
| Plain-SQL render of backup | **Verified** | `pg_restore --file` → 0.40 MB valid SQL |
| Live restore into a target DB | **NOT VERIFIED** | No restore target available to this environment |
| Supabase PITR / retention window | **UNVERIFIED — owner must confirm** | WAL archiving being on does **not** prove PITR is enabled or what the retention window is; that is a project-plan setting readable only in the Supabase dashboard |
| Streaming replica | **None** | `pg_replication_slots` and `pg_stat_replication` are both empty |
| Storage object backup | **None** | See §3 |
| Automated backup schedule | **None in this repo** | Backups are currently manual |

Database size: **19 MB**. Largest tables are all under 200 kB, so restore time is
dominated by connection and index rebuild, not data volume.

---

## 2. RPO / RTO

These are **assumptions derived from the evidence above**, not guarantees.

| Scenario | RPO (data loss) | RTO (time to serve) | Confidence |
|---|---|---|---|
| Restore from a manual `pg_dump` | Since the last dump — **currently unbounded, because dumps are manual** | ~15–30 min (dump exists) | High — path tested |
| Supabase PITR restore | Seconds-to-minutes, **if PITR is enabled** | 30–90 min (provider-driven) | **Unverified** — depends on plan |
| Total project loss with no PITR | Everything since the last manual dump | Hours | High |

**The single largest gap: there is no scheduled backup.** Until §6 is
implemented, the honest RPO is "since whenever someone last ran the command".

---

## 3. What a database backup does NOT recover

Verified against the live project — each of these is real and currently non-zero:

1. **Vault secrets (1 row).** `vault.secrets` holds tenant provider credentials
   and YouTube refresh tokens *encrypted*. A logical dump of `public` does not
   include them, and even a full dump cannot be decrypted without the project's
   vault encryption key. **After any restore into a NEW project, every tenant
   must reconnect their providers and YouTube channel.**
2. **Auth users (2 rows).** `auth.users` lives in the `auth` schema, which the
   `--schema=public` dump deliberately excludes. `public.profiles` and
   `public.memberships` reference `auth.users` ids, so restoring `public` alone
   leaves memberships pointing at users that do not exist.
3. **Storage objects (2 rows).** `storage.objects` holds metadata; the actual
   bytes (rendered videos, brand assets, avatars) live in S3-backed storage and
   are **not** in any database backup.

A restore that ignores these produces a database that looks complete and is not.

---

## 4. Backup procedure (tested)

Run from the repo root with `.env` present.

```bash
# Full public-schema backup, custom format (compressed, selectively restorable)
pg_dump --format=custom --no-owner --no-privileges \
        --schema=public \
        --file backups/public-$(date +%Y%m%dT%H%M%SZ).dump \
        "$SUPABASE_DB_URL"

# Include auth + storage metadata for a same-project restore
pg_dump --format=custom --no-owner --no-privileges \
        --schema=public --schema=auth --schema=storage \
        --file backups/full-$(date +%Y%m%dT%H%M%SZ).dump \
        "$SUPABASE_DB_URL"
```

Windows path used during verification:
`C:\Program Files\PostgreSQL\18\bin\pg_dump.exe` (client 18 against server 17 —
forward-compatible; **never** dump with a client older than the server).

### Verify every backup before trusting it

```bash
pg_restore --list backups/<file>.dump | grep -c "TABLE DATA"   # non-zero
pg_restore --list backups/<file>.dump | grep -E "is_super_admin|append_stage_version|store_credential"
```

A backup that has not been listed is not a backup. This check is what caught
that the archive contains all 41 functions and 172 policies, not just tables.

---

## 5. Restore procedures

### 5a. Point-in-time restore (preferred — **owner must confirm availability**)

1. Supabase Dashboard → Database → Backups → Restore.
2. Pick the timestamp immediately **before** the incident.
3. Supabase restores in place or to a new project. Vault keys travel with an
   in-place restore; a new project means §3 applies.
4. Re-run §7 verification.

### 5b. Logical restore into a fresh database (tested to the archive boundary)

```bash
# 1. Provision the target and enable the extensions the schema needs
psql "$TARGET_URL" -c 'create extension if not exists "uuid-ossp";'
psql "$TARGET_URL" -c 'create extension if not exists pgcrypto;'
psql "$TARGET_URL" -c 'create extension if not exists supabase_vault;'

# 2. Restore. --clean --if-exists makes the run repeatable.
pg_restore --dbname "$TARGET_URL" --no-owner --no-privileges \
           --clean --if-exists --exit-on-error \
           backups/public-<stamp>.dump

# 3. Roles referenced by grants/policies must exist first
psql "$TARGET_URL" -c "do \$\$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end \$\$;"
```

**Then §3 applies**: re-issue vault credentials, restore `auth` users, restore
storage objects. Publishing stays safely dry until each tenant reconnects,
because `resolvePublishMode()` derives live/dry from real credential state.

### 5c. Partial / single-table recovery

```bash
pg_restore --dbname "$TARGET_URL" --data-only --table=pipeline_stages \
           backups/public-<stamp>.dump
```

Use for accidental deletion of one table's rows. **Do not** use `--data-only`
into a live table without first confirming the immutability triggers — restoring
`stage_versions` rows requires `set app.version_purge = 'on'` for any delete
step, by design.

---

## 6. Migration recovery / rollback

All **8 registered migrations are additive with 0 breaking changes**
(`schema_migrations_registry`), which is what makes rollback viable at all.

- **Rolling back code without rolling back the database is the default and is
  safe.** Additive migrations leave the previous application version working:
  new columns are nullable or defaulted, new tables are unused by old code.
- **There are no down-migrations.** This is deliberate — a down-migration that
  drops a column destroys data that the failed release may already have written.
- To reverse a specific migration, write a NEW forward migration that undoes
  precisely what is safe to undo, and register it. Never edit an applied file.
- Before any migration, take a §4 backup. Migration files are idempotent
  (`if not exists`, `create or replace`), so re-running is safe.

---

## 7. Verification after any recovery

Run in order. Each has a hard pass condition.

```bash
# 1. Structural integrity — must all be zero / empty
python scripts/verify_recovery.py

# 2. Security invariants (real JWTs, not service role)
node --experimental-strip-types --import ./m15-hooks.mjs ./security-regression.test.ts

# 3. Application suites
.venv/Scripts/python.exe -m pytest tests -q
```

`verify_recovery.py` (shipped in `scripts/`) asserts:
- 0 tables with RLS enabled but no policy
- 0 tenant-scoped tables without a `tenant_id` index
- `profiles` UPDATE grants limited to the 4 safe columns
- all expected SECURITY DEFINER functions present with pinned `search_path`
- platform baselines intact (approval policy, 4 playbooks, 5 SLAs)
- no orphaned tenant rows

---

## 8. Application-level recovery (already implemented and tested)

These need no runbook — they are code paths with tests:

| Failure | Recovery | Where |
|---|---|---|
| Worker crash mid-job | Lease expires, `reap_stale_jobs()` returns the job to the queue | M11 |
| Job exhausted retries | Dead-letter queue + auto-raised incident with a playbook | M11/M15 |
| Dead job needs replay | `redrive(jobId)` preserves the idempotency key | M11 |
| Interrupted publish | Claim row + YouTube run-marker reconciliation — a retry adopts the existing upload instead of duplicating it | This phase |
| Undelivered events | `event_outbox` relay retries with backoff | M14 |
| Bad human edit | Immutable `stage_versions`; restore appends a version | M15 |
| Runaway automation | Workspace emergency stop + platform-wide stop | M15 |

Current state: 2 dead jobs, 0 pending outbox rows.

---

## 9. Owner actions required

These cannot be done from the codebase and are **open**:

1. **Confirm Supabase PITR is enabled and record the retention window.**
   Dashboard → Database → Backups. WAL archiving is demonstrably running, but
   whether restores are available and how far back is a plan setting. Until
   confirmed, assume **no PITR**.
2. **Schedule the §4 backup.** Nightly, to storage outside the Supabase project.
   Without this the real RPO is unbounded.
3. **Store backups off-provider.** A backup inside the account you are
   recovering from does not survive account loss.
4. **Provision a restore target and run §5b end-to-end.** This is the one step
   that converts "backup verified" into "recovery verified". Budget ~1 hour.
5. **Record the vault re-key procedure** for the credentials in §3.
6. **Decide the storage-bucket backup approach** (bucket→bucket replication or a
   scheduled sync); rendered videos are currently unprotected.

---

## 10. Honest summary

The database **can** be backed up, and the backup **is** valid and complete —
both were executed and verified, not assumed. What is missing is everything that
turns that into recovery: a schedule, off-site copies, a tested restore, and
confirmation of the provider's PITR. Storage objects and vault secrets are not
covered by any backup that exists today.

**Do not describe this platform as disaster-recovery-ready until items 1–4 in §9
are complete.**
