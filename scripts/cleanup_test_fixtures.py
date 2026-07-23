"""Removes every `ZZ-*` test fixture and proves none is left behind.

Used by the security-regression CI job and after any local test run. Some tables
are append-only by design (`stage_versions`, `security_audit`), so this sets the
same sanctioned purge flags a real retention job would — that is the only way to
remove them, which is exactly the point of those guards.

Usage:  python scripts/cleanup_test_fixtures.py
"""
import os
import sys

import psycopg2

# Ordered so children go before parents; every one is tenant-scoped.
TENANT_TABLES = [
    "security_audit", "ops_playbook_runs", "security_incidents", "approval_decisions",
    "approval_chain_votes", "approval_chain_instances", "approval_chains",
    "compliance_checks", "quality_scores", "comment_mentions", "comments",
    "notification_preferences", "notifications", "schedules", "subscriptions",
    "api_keys", "webhook_endpoints", "tenant_settings", "jobs", "event_log",
    "api_usage", "analytics", "videos", "scenes", "stories", "channels",
    "audit_log", "pipeline_stages", "pipeline_runs", "memberships",
    "sla_definitions", "ops_playbooks",
]


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

cur.execute("select id, name from tenants where name like 'ZZ-%%'")
tenants = cur.fetchall()
print(f"test tenants found: {[t[1] for t in tenants] or 'none'}")

# Sanctioned purge flags — the append-only guards refuse deletion without them.
cur.execute("set app.version_purge = 'on'")
cur.execute("set app.audit_purge = 'on'")
for tid, name in tenants:
    cur.execute("update pipeline_stages set active_version_id = null where tenant_id = %s", (tid,))
    cur.execute("delete from stage_versions where tenant_id = %s", (tid,))
    for table in TENANT_TABLES:
        try:
            cur.execute(f"delete from {table} where tenant_id = %s", (tid,))
        except psycopg2.Error as exc:
            print(f"  WARN {table}: {str(exc).splitlines()[0]}")
    cur.execute("delete from tenants where id = %s", (tid,))
    print(f"  removed {name}")
cur.execute("set app.version_purge = 'off'")
cur.execute("set app.audit_purge = 'off'")

# Orphaned chain steps (no tenant_id of their own) and test config entries.
cur.execute("delete from approval_chain_steps where chain_id not in (select id from approval_chains)")
cur.execute("update config_entries set active_version_id = null where namespace in ('zz','zzsec')")
cur.execute("delete from config_versions where entry_id in (select id from config_entries where namespace in ('zz','zzsec'))")
cur.execute("delete from config_entries where namespace in ('zz','zzsec')")

passed = failed = 0


def check(condition: bool, name: str) -> None:
    global passed, failed
    if condition:
        passed += 1
    else:
        failed += 1
        print(f"  LEFTOVER: {name}")


cur.execute("select count(*) from tenants where name like 'ZZ%%'")
check(cur.fetchone()[0] == 0, "test tenants")

for table in ("stage_versions", "approval_decisions", "security_incidents", "comments",
              "comment_mentions", "notifications", "notification_preferences",
              "ops_playbook_runs", "pipeline_stages", "pipeline_runs", "jobs",
              "quality_scores", "compliance_checks", "videos", "api_keys"):
    cur.execute(
        f"select count(*) from {table} "
        "where tenant_id is not null and tenant_id not in (select id from tenants)"
    )
    check(cur.fetchone()[0] == 0, f"orphan rows in {table}")

cur.execute("select count(*) from approval_chain_steps where chain_id not in (select id from approval_chains)")
check(cur.fetchone()[0] == 0, "orphan approval_chain_steps")

# The real seeded baselines must SURVIVE the cleanup.
cur.execute("select count(*) from ops_playbooks where tenant_id is null")
check(cur.fetchone()[0] == 4, "platform playbooks intact")
cur.execute("select count(*) from sla_definitions where tenant_id is null")
check(cur.fetchone()[0] == 5, "platform SLAs intact")
cur.execute("select count(*) from approval_policies where scope_type = 'platform'")
check(cur.fetchone()[0] == 1, "platform approval policy intact")

print(f"\n  {passed} checks passed, {failed} failed")
sys.exit(1 if failed else 0)
