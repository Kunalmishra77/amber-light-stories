"""Post-recovery structural verification.

Run after ANY restore, migration, or environment change. Every check has a hard
pass condition and exits non-zero on failure, so it can gate a deploy.

Usage:  python scripts/verify_recovery.py          (reads SUPABASE_DB_URL from .env)
"""
import os
import sys

import psycopg2


def db_url() -> str:
    if os.environ.get("SUPABASE_DB_URL"):
        return os.environ["SUPABASE_DB_URL"]
    for line in open(".env", encoding="utf-8"):
        if line.strip().startswith("SUPABASE_DB_URL"):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("SUPABASE_DB_URL not found (env or .env)")


conn = psycopg2.connect(db_url())
conn.autocommit = True
cur = conn.cursor()

passed = failed = 0


def check(condition: bool, name: str, detail: str = "") -> None:
    global passed, failed
    if condition:
        passed += 1
        print(f"  PASS  {name}")
    else:
        failed += 1
        print(f"  FAIL  {name}{(' -> ' + detail) if detail else ''}")


def q(sql, args=None):
    cur.execute(sql, args or ())
    return cur.fetchall()


print("\n=== TENANT ISOLATION STRUCTURE ===")
orphan_rls = [r[0] for r in q("""
    select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_policy p on p.polrelid = c.oid
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
    group by c.relname having count(p.polname) = 0""")]
check(not orphan_rls, "every RLS-enabled table has at least one policy", str(orphan_rls))

no_rls = [r[0] for r in q("""
    select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
      and exists (select 1 from information_schema.columns col
                  where col.table_schema = 'public' and col.table_name = c.relname
                    and col.column_name = 'tenant_id')""")]
check(not no_rls, "every tenant-scoped table has RLS enabled", str(no_rls))

unindexed = [r[0] for r in q("""
    select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and exists (select 1 from information_schema.columns col
                  where col.table_schema = 'public' and col.table_name = c.relname
                    and col.column_name = 'tenant_id')
      and not exists (
        select 1 from pg_index i
        join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
        where i.indrelid = c.oid and a.attname = 'tenant_id')""")]
check(not unindexed, "every tenant_id is indexed (RLS filters on it)", str(unindexed))

print("\n=== PRIVILEGE BOUNDARIES ===")
profile_cols = sorted(r[0] for r in q("""
    select column_name from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'profiles'
      and grantee = 'authenticated' and privilege_type = 'UPDATE'"""))
check(profile_cols == ["avatar", "full_name", "must_change_password", "password_changed_at"],
      "profiles: users may update only safe columns (no is_super_admin)", str(profile_cols))

anon_dml = [r[0] for r in q("""
    select privilege_type from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'profiles' and grantee = 'anon'
      and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')""")]
check(not anon_dml, "profiles: anon holds no write grants", str(anon_dml))

check(bool(q("select 1 from pg_trigger where tgname = 'trg_profile_privilege'")),
      "profiles: privilege-escalation trigger present")

print("\n=== SECURITY DEFINER SURFACE ===")
EXPECTED = ["is_super_admin", "my_tenant_ids", "my_org_ids", "is_tenant_manager",
            "append_stage_version", "store_credential", "get_credential",
            "claim_jobs", "reap_stale_jobs", "run_data_quality_checks",
            "admin_tenant_usage", "admin_tenant_health"]
for fn in EXPECTED:
    row = q("""select p.proname, coalesce(array_to_string(p.proconfig, ','), '')
               from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = %s""", (fn,))
    check(bool(row) and any("search_path" in r[1] for r in row),
          f"{fn}() exists with a pinned search_path")

leaky = [r[0] for r in q("""
    select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and has_function_privilege('anon', p.oid, 'execute')
      and p.prorettype not in ('trigger'::regtype::oid, 'event_trigger'::regtype::oid)""")]
check(set(leaky) <= {"is_super_admin", "my_tenant_ids", "my_org_ids"},
      "no privileged SECURITY DEFINER function is executable by anon", str(leaky))

print("\n=== IMMUTABILITY / INTEGRITY ===")
for table, trg in [("stage_versions", "trg_stage_version_immutability"),
                   ("approval_decisions", "trg_decision_evidence"),
                   ("approval_decisions", "trg_decision_no_update"),
                   ("security_audit", "trg_security_audit_no_update")]:
    check(bool(q("select 1 from pg_trigger where tgname = %s", (trg,))),
          f"{table}: {trg} present")

flag_trgs = q("select count(*) from pg_trigger where tgname like 'trg_%%_immutable_flag'")
check(flag_trgs[0][0] >= 5, "immutability is one-way on all version tables",
      f"found {flag_trgs[0][0]}")

print("\n=== PLATFORM BASELINES ===")
check(q("select count(*) from approval_policies where scope_type = 'platform'")[0][0] == 1,
      "platform approval policy present")
check(q("select count(*) from ops_playbooks where tenant_id is null")[0][0] == 4,
      "4 platform playbooks present")
check(q("select count(*) from sla_definitions where tenant_id is null")[0][0] == 5,
      "5 platform SLAs present")
check(q("select count(*) from permissions")[0][0] >= 18, "permission catalogue seeded")
check(q("select count(*) from role_permissions")[0][0] >= 60, "role-permission matrix seeded")

print("\n=== DATA CONSISTENCY ===")
for table in ("pipeline_stages", "pipeline_runs", "stories", "videos", "jobs",
              "approval_decisions", "stage_versions", "notifications", "comments"):
    n = q(f"""select count(*) from {table}
              where tenant_id is not null and tenant_id not in (select id from tenants)""")[0][0]
    check(n == 0, f"{table}: no rows orphaned from a deleted tenant", str(n))

check(q("select count(*) from tenants where name like 'ZZ%%'")[0][0] == 0,
      "no test tenants remain")

print(f"\n{'=' * 52}\n  {passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
