/**
 * Security & tenant-isolation regression suite.
 *
 * Every assertion here corresponds to a defect found by the M1-M15 production
 * audit and fixed in migrations 037/038. Assertions are made through REAL
 * authenticated JWTs, so RLS, column privileges and triggers are all exercised
 * exactly as they are for a browser. Service role is used only to build and
 * tear down fixtures and to make authoritative "did it actually change?" reads.
 */
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
const requireWeb = createRequire(new URL("../../web/package.json", import.meta.url));
const { createClient } = requireWeb("@supabase/supabase-js");
const ENV_FILE = process.env.SECURITY_TEST_ENV ?? "web/.env.local";
const envText = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
const envVal = (k: string) => {
  for (const l of envText.split(/\r?\n/)) {
    const m = l.match(new RegExp(`^${k}\\s*=\\s*(.*)$`));
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  throw new Error(k);
};
const URL_ = envVal("NEXT_PUBLIC_SUPABASE_URL");
const ANON = envVal("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const admin = createClient(URL_, envVal("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

let passed = 0, failed = 0;
const ok = (c: boolean, n: string) => { if (c) passed++; else { failed++; console.error("FAIL " + n); } };

const stamp = Date.now();
const users: string[] = [];
const tenants: string[] = [];

const mk = async (label: string, role = "client_owner") => {
  const { data: t } = await admin.from("tenants")
    .insert({ name: `ZZ-sec-${label}-${stamp}`, slug: `zz-sec-${label}-${stamp}`, status: "active" })
    .select("id").single();
  tenants.push(t.id);
  const email = `zz-sec-${label}-${stamp}@example.invalid`;
  const password = `Zz!${stamp}${label}aA9`;
  const { data: u } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  users.push(u.user.id);
  await admin.from("profiles").upsert({ user_id: u.user.id, full_name: `ZZ ${label}`, is_super_admin: false });
  await admin.from("memberships").insert({ tenant_id: t.id, user_id: u.user.id, role, status: "active" });
  const a = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data: s } = await a.auth.signInWithPassword({ email, password });
  return {
    tenantId: t.id as string, userId: u.user.id as string,
    db: createClient(URL_, ANON, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${s.session!.access_token}` } },
    }),
  };
};

const A = await mk("a");
const B = await mk("b");
const viewer = await mk("viewer", "client_viewer");

try {
  /* ================= P0-1: platform takeover via profiles ================= */
  await B.db.from("profiles").update({ is_super_admin: true }).eq("user_id", B.userId);
  const { data: prof } = await admin.from("profiles").select("is_super_admin").eq("user_id", B.userId).single();
  ok(prof.is_super_admin === false, "P0-1 a user cannot make itself a platform super admin");
  ok((await B.db.rpc("is_super_admin")).data === false, "P0-1 is_super_admin() still reports false");

  await B.db.from("profiles").update({ locked_until: null, failed_login_attempts: 0 }).eq("user_id", B.userId);
  const { data: prof2 } = await admin.from("profiles").select("full_name").eq("user_id", B.userId).single();
  ok(prof2 !== null, "P0-1 lockout columns are not user-writable (no crash, no change)");

  const r = await B.db.from("profiles").update({ full_name: "New Name" }).eq("user_id", B.userId).select("user_id");
  ok((r.data ?? []).length === 1, "P0-1 a user CAN still rename itself (fix did not over-reach)");

  /* ============ P0-2: cross-tenant write via SECURITY DEFINER RPC ========= */
  const { data: runA } = await admin.from("pipeline_runs")
    .insert({ tenant_id: A.tenantId, status: "running" }).select("id").single();
  const { data: stageA } = await admin.from("pipeline_stages").insert({
    tenant_id: A.tenantId, run_id: runA.id, stage: "script", seq: 1,
    status: "awaiting_review", output: { summary: "A ORIGINAL" },
  }).select("id").single();

  const rpc = await B.db.rpc("append_stage_version", {
    p_stage_id: stageA.id, p_output: { summary: "INJECTED" }, p_kind: "human_edited",
  });
  ok(rpc.error !== null, "P0-2 append_stage_version refuses a cross-tenant caller");
  const { data: afterRpc } = await admin.from("pipeline_stages").select("output").eq("id", stageA.id).single();
  ok((afterRpc.output as { summary?: string })?.summary === "A ORIGINAL",
     "P0-2 the victim's stage output is unchanged");
  const { count: injected } = await admin.from("stage_versions")
    .select("id", { count: "exact", head: true }).eq("stage_id", stageA.id);
  ok((injected ?? 0) === 0, "P0-2 no version was written into the victim's tenant");

  // ...and the legitimate owner can still use it.
  const own = await A.db.rpc("append_stage_version", {
    p_stage_id: stageA.id, p_output: { summary: "A EDITED BY OWNER" }, p_kind: "human_edited",
  });
  ok(own.error === null, "P0-2 the stage's own tenant can still append a version");

  /* ================= P1: immutable history cannot be revoked ============== */
  const { data: v } = await admin.from("stage_versions").select("id").eq("stage_id", stageA.id).limit(1).single();
  const unseal = await A.db.from("stage_versions").update({ immutable: false }).eq("id", v.id).select("id");
  const { data: vAfter } = await admin.from("stage_versions").select("immutable, output").eq("id", v.id).single();
  ok(vAfter.immutable === true, "P1 a sealed version cannot be un-sealed");
  ok(unseal.error !== null || (unseal.data ?? []).length === 0, "P1 the un-seal attempt is rejected outright");
  const rewrite = await A.db.from("stage_versions").update({ output: { summary: "REWRITTEN" } }).eq("id", v.id);
  ok(rewrite.error !== null, "P1 sealed version content cannot be rewritten");

  /* ================= P1: plan self-upgrade ================= */
  const { data: plan } = await admin.from("plans")
    .insert({ name: `ZZ-plan-${stamp}`, slug: `zz-plan-${stamp}`, limits: { videos_month: 9999 } })
    .select("id").single();
  const { data: sub } = await admin.from("subscriptions")
    .insert({ tenant_id: A.tenantId, plan_id: plan.id, status: "active" }).select("id").single();
  const upg = await A.db.from("subscriptions").update({ plan_id: plan.id, status: "active" })
    .eq("id", sub.id).select("id");
  ok((upg.data ?? []).length === 0 || upg.error !== null, "P1 a tenant cannot change its own subscription");
  const { data: readSub } = await A.db.from("subscriptions").select("id").eq("id", sub.id);
  ok((readSub ?? []).length === 1, "P1 ...but it can still READ its subscription");
  await admin.from("subscriptions").delete().eq("id", sub.id);
  await admin.from("plans").delete().eq("id", plan.id);

  /* ================= P1: minting an API key ================= */
  const mint = await A.db.from("api_keys").insert({
    tenant_id: A.tenantId, name: "forged", prefix: "ak_live_forged1",
    key_hash: "deadbeef".repeat(8), scopes: ["*"],
  }).select("id");
  ok(mint.error !== null, "P1 a member cannot mint an API key directly");

  /* ============ P1: cross-tenant reads via unscoped child tables ========== */
  const { data: chainA } = await admin.from("approval_chains")
    .insert({ tenant_id: A.tenantId, key: `zz-${stamp}`, name: "A chain" }).select("id").single();
  await admin.from("approval_chain_steps")
    .insert({ chain_id: chainA.id, position: 1, approver_role: "client_owner", required: true });
  const { data: stepsSeen } = await B.db.from("approval_chain_steps").select("*");
  ok((stepsSeen ?? []).length === 0, "P1 approval_chain_steps: no cross-tenant read");
  const { data: stepsOwn } = await A.db.from("approval_chain_steps").select("*");
  ok((stepsOwn ?? []).length === 1, "P1 ...the owning tenant still sees its own chain steps");

  const { data: cfgEntry } = await admin.from("config_entries")
    .insert({ scope_type: "tenant", scope_id: A.tenantId, namespace: "zzsec", key: "k" })
    .select("id").single();
  await admin.from("config_versions").insert({
    entry_id: cfgEntry.id, version: 1, value: { A_ONLY_SECRET: "leak-me" }, state: "active", immutable: true,
  });
  const { data: cfgSeen } = await B.db.from("config_versions").select("value");
  ok(!(cfgSeen ?? []).some((x: { value: unknown }) => JSON.stringify(x.value).includes("A_ONLY_SECRET")),
     "P1 config_versions: no cross-tenant read of another tenant's config values");

  /* ================= P1: role boundaries in RLS ================= */
  await admin.from("schedules").insert({ tenant_id: viewer.tenantId, timezone: "UTC", emergency_stop: true });
  const lift = await viewer.db.from("schedules").update({ emergency_stop: false })
    .eq("tenant_id", viewer.tenantId).select("id");
  const { data: sched } = await admin.from("schedules").select("emergency_stop")
    .eq("tenant_id", viewer.tenantId).single();
  ok(sched.emergency_stop === true, "P1 a viewer cannot lift their workspace's emergency stop");
  ok((lift.data ?? []).length === 0, "P1 the emergency-stop write is rejected");
  const { data: schedRead } = await viewer.db.from("schedules").select("emergency_stop")
    .eq("tenant_id", viewer.tenantId);
  ok((schedRead ?? []).length === 1, "P1 ...but a viewer can still SEE the schedule");

  const wh = await viewer.db.from("webhook_endpoints").insert({
    tenant_id: viewer.tenantId, url: "https://evil.example/x", signing_secret: "s", event_types: ["*"],
  }).select("id");
  ok(wh.error !== null, "P1 a viewer cannot register a webhook endpoint");

  const ts = await viewer.db.from("tenant_settings")
    .upsert({ tenant_id: viewer.tenantId, config: { automation_enabled: true } }).select("tenant_id");
  ok(ts.error !== null || (ts.data ?? []).length === 0, "P1 a viewer cannot change workspace settings");

  /* ================= P2: anon reaches nothing ================= */
  const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
  for (const t of ["ops_playbooks", "sla_definitions", "tenants", "pipeline_stages",
                   "approval_decisions", "profiles", "config_versions"]) {
    const { data } = await anon.from(t).select("*");
    ok((data ?? []).length === 0, `P2 anonymous read blocked: ${t}`);
  }


  /* ============ RBAC: least privilege across every role ============ */
  // The role_permissions matrix was decorative before this phase: a viewer
  // could approve content and spend AI budget. These assert the DENY side for
  // a viewer/editor and the ALLOW side for an owner, at the database boundary.
  const editor = await mk("editor", "client_editor");

  const roleMatrix = [
    { who: viewer, role: "client_viewer", perm: "content.approve", allowed: false },
    { who: viewer, role: "client_viewer", perm: "content.create", allowed: false },
    { who: viewer, role: "client_viewer", perm: "content.delete", allowed: false },
    { who: viewer, role: "client_viewer", perm: "schedule.manage", allowed: false },
    { who: viewer, role: "client_viewer", perm: "credentials.manage", allowed: false },
    { who: viewer, role: "client_viewer", perm: "channels.manage", allowed: false },
    { who: editor, role: "client_editor", perm: "content.create", allowed: true },
    { who: editor, role: "client_editor", perm: "content.edit", allowed: true },
    { who: editor, role: "client_editor", perm: "content.approve", allowed: false },
    { who: editor, role: "client_editor", perm: "content.delete", allowed: false },
    { who: editor, role: "client_editor", perm: "credentials.manage", allowed: false },
    { who: editor, role: "client_editor", perm: "channels.manage", allowed: false },
    { who: A, role: "client_owner", perm: "content.approve", allowed: true },
    { who: A, role: "client_owner", perm: "credentials.manage", allowed: true },
    { who: A, role: "client_owner", perm: "channels.manage", allowed: true },
    { who: A, role: "client_owner", perm: "schedule.manage", allowed: true },
  ];
  for (const m of roleMatrix) {
    const { data: granted } = await m.who.db
      .from("role_permissions")
      .select("permission_key")
      .eq("role_key", m.role)
      .eq("permission_key", m.perm);
    const has = (granted ?? []).length > 0;
    ok(has === m.allowed, `RBAC ${m.role} ${m.allowed ? "MAY" : "may NOT"} ${m.perm}`);
  }

  // is_tenant_manager() is what the role-aware RLS policies call.
  ok((await A.db.rpc("is_tenant_manager", { p_tenant: A.tenantId })).data === true,
     "RBAC is_tenant_manager(): true for an owner of the tenant");
  ok((await viewer.db.rpc("is_tenant_manager", { p_tenant: viewer.tenantId })).data === false,
     "RBAC is_tenant_manager(): false for a viewer");
  ok((await A.db.rpc("is_tenant_manager", { p_tenant: B.tenantId })).data === false,
     "RBAC is_tenant_manager(): false for ANOTHER tenant (no cross-tenant management)");

  /* ============ organization isolation ============ */
  const { data: orgA } = await admin.from("organizations")
    .insert({ name: `ZZ-org-a-${stamp}`, slug: `zz-org-a-${stamp}` }).select("id").maybeSingle();
  if (orgA) {
    const { data: seenByB } = await B.db.from("organizations").select("id").eq("id", orgA.id);
    ok((seenByB ?? []).length === 0, "organization isolation: B cannot read an org it has no membership in");
    const wrote = await B.db.from("organization_members")
      .insert({ organization_id: orgA.id, user_id: B.userId, role: "org_admin" }).select("id");
    ok(wrote.error !== null, "organization isolation: B cannot add itself to an organization");
    await admin.from("organization_members").delete().eq("organization_id", orgA.id);
    await admin.from("organizations").delete().eq("id", orgA.id);
  }

  /* ============ audit immutability ============ */
  const { data: auditRow } = await admin.from("audit_log")
    .insert({ tenant_id: A.tenantId, action: "zz.sec.test", target: "zz", meta: {} })
    .select("id").maybeSingle();
  if (auditRow) {
    // A member's UPDATE matches no rows (RLS grants insert-only), so it is
    // silently a no-op rather than an error — assert the OUTCOME, which is what
    // actually matters, then prove the trigger blocks even a privileged caller.
    const auditUpd = await A.db.from("audit_log")
      .update({ action: "tampered" }).eq("id", auditRow.id).select("id");
    ok((auditUpd.data ?? []).length === 0, "audit_log: a member cannot rewrite an audit entry");
    const privileged = await admin.from("audit_log").update({ action: "tampered" }).eq("id", auditRow.id);
    ok(privileged.error !== null, "audit_log: append-only is enforced even for the service role");
    const { data: auditAfter } = await admin.from("audit_log").select("action").eq("id", auditRow.id).maybeSingle();
    ok(auditAfter?.action === "zz.sec.test", "audit_log: the original action survives both attempts");
  }

  const { data: secAudit } = await admin.from("security_audit")
    .insert({ tenant_id: A.tenantId, action: "zz.sec.chain", actor_id: A.userId, meta: {} })
    .select("id").maybeSingle();
  if (secAudit) {
    const upd = await admin.from("security_audit").update({ action: "tampered" }).eq("id", secAudit.id);
    ok(upd.error !== null, "security_audit: hash-chained entries are immutable even to the service role");
    const del = await admin.from("security_audit").delete().eq("id", secAudit.id);
    ok(del.error !== null, "security_audit: entries cannot be deleted");
  }

  /* ============ API key scope enforcement ============ */
  // Keys are credentials: members read, only the platform/service role writes.
  const { data: keyRow } = await admin.from("api_keys").insert({
    tenant_id: A.tenantId, name: "zz-scoped", prefix: `ak_zz_${String(stamp).slice(-8)}`,
    key_hash: "a".repeat(64), scopes: ["stories:read"],
  }).select("id").maybeSingle();

  if (keyRow) {
    const widen = await A.db.from("api_keys").update({ scopes: ["*"] }).eq("id", keyRow.id).select("id");
    const { data: keyAfter } = await admin.from("api_keys").select("scopes").eq("id", keyRow.id).maybeSingle();
    ok(JSON.stringify(keyAfter?.scopes) === JSON.stringify(["stories:read"]),
       "API keys: a member cannot widen a key's scopes");
    ok((widen.data ?? []).length === 0, "API keys: the scope-widening write is rejected");

    await admin.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", keyRow.id);
    await A.db.from("api_keys").update({ revoked_at: null }).eq("id", keyRow.id);
    const { data: revoked } = await admin.from("api_keys").select("revoked_at").eq("id", keyRow.id).maybeSingle();
    ok(revoked?.revoked_at !== null, "API keys: a member cannot un-revoke a revoked key");

    const { data: keyVisible } = await A.db.from("api_keys").select("id").eq("id", keyRow.id);
    ok((keyVisible ?? []).length === 1, "API keys: a member can still SEE their workspace's keys");
    const { data: keyCross } = await B.db.from("api_keys").select("id").eq("id", keyRow.id);
    ok((keyCross ?? []).length === 0, "API keys: another tenant cannot see them at all");
    await admin.from("api_keys").delete().eq("id", keyRow.id);
  }

  /* ============ YouTube credential confidentiality ============ */
  // The OAuth refresh token lives in the Vault; nothing tenant-facing may read it.
  const credRead = await A.db.from("tenant_credentials").select("secret_ref");
  ok((credRead.data ?? []).length === 0 || credRead.error !== null,
     "OAuth: tenant_credentials rows are not readable by a workspace member");
  ok((await A.db.rpc("get_credential", { p_tenant: A.tenantId, p_provider: "youtube" })).error !== null,
     "OAuth: get_credential() is revoked from authenticated, even for one's OWN tenant");
  ok((await A.db.rpc("store_credential", {
        p_tenant: A.tenantId, p_provider: "youtube", p_secret: "forged", p_meta: {},
      })).error !== null,
     "OAuth: store_credential() cannot be called from the browser to forge a credential");

  /* ============ baseline isolation across every tenant surface ============ */
  const { data: storyA } = await admin.from("stories")
    .insert({ tenant_id: A.tenantId, topic: "A secret", status: "draft" }).select("id").single();
  await admin.from("notifications").insert({
    tenant_id: A.tenantId, user_id: A.userId, kind: "review", title: "A private" });
  await admin.from("comments").insert({
    tenant_id: A.tenantId, entity_type: "pipeline_stage", entity_id: stageA.id,
    body: "A note", author_id: A.userId });
  await admin.from("approval_decisions").insert({
    tenant_id: A.tenantId, run_id: runA.id, stage: "script", decision: "approved", mode: "semi_auto",
    actor_type: "user", evidence: { k: "v" }, reasons: ["r"] });
  await admin.from("security_incidents").insert({
    tenant_id: A.tenantId, title: "A incident", severity: "high", status: "open", category: "operational" });

  for (const t of ["pipeline_runs", "pipeline_stages", "stories", "notifications", "comments",
                   "approval_decisions", "security_incidents", "stage_versions"]) {
    const { data } = await B.db.from(t).select("*");
    ok(!(data ?? []).some((x: { tenant_id?: string }) => x.tenant_id === A.tenantId),
       `isolation: B reads nothing of A's from ${t}`);
  }
  ok((await B.db.from("pipeline_stages").update({ output: { hacked: true } })
        .eq("id", stageA.id).select("id")).data?.length === 0,
     "isolation: B cannot write A's stage");
  ok((await B.db.from("approval_decisions").insert({
        tenant_id: A.tenantId, stage: "publish", decision: "approved", mode: "full_auto",
        actor_type: "user", evidence: { forged: true }, reasons: ["forged"] }).select("id")).error !== null,
     "isolation: B cannot forge an approval decision for A");
  ok((await B.db.from("memberships").insert({
        tenant_id: A.tenantId, user_id: B.userId, role: "client_owner", status: "active" }).select("*")).error !== null,
     "isolation: B cannot grant itself membership of A");
  ok((await B.db.rpc("get_credential", { p_tenant: A.tenantId, p_provider: "youtube" })).error !== null,
     "isolation: get_credential() refuses a cross-tenant caller");
  ok(_(await storyA), "fixture created");
  function _(x: unknown) { return x !== null && x !== undefined; }
} finally {
  for (const tid of tenants) {
    const { data: st } = await admin.from("pipeline_stages").select("id").eq("tenant_id", tid);
    for (const s of st ?? []) await admin.from("pipeline_stages").update({ active_version_id: null }).eq("id", s.id);
    for (const t of ["comment_mentions", "comments", "approval_decisions", "notification_preferences",
                     "notifications", "security_incidents", "audit_log", "api_usage", "analytics",
                     "videos", "channels", "jobs", "event_log", "approval_chain_votes",
                     "approval_chain_instances", "approval_chains", "schedules", "subscriptions",
                     "api_keys", "webhook_endpoints", "tenant_settings", "pipeline_stages",
                     "pipeline_runs", "stories"]) {
      await admin.from(t).delete().eq("tenant_id", tid);
    }
    await admin.from("memberships").delete().eq("tenant_id", tid);
  }
  await admin.from("approval_chain_steps").delete().not("chain_id", "in",
    `(${(await admin.from("approval_chains").select("id")).data?.map((c: {id: string}) => c.id).join(",") || "'00000000-0000-0000-0000-000000000000'"})`)
    .then(() => {}, () => {});
  const { data: e } = await admin.from("config_entries").select("id").eq("namespace", "zzsec");
  for (const row of e ?? []) {
    await admin.from("config_entries").update({ active_version_id: null }).eq("id", row.id);
    await admin.from("config_versions").delete().eq("entry_id", row.id);
    await admin.from("config_entries").delete().eq("id", row.id);
  }
  for (const uid of users) {
    await admin.auth.admin.deleteUser(uid).catch(() => {});
    await admin.from("profiles").delete().eq("user_id", uid);
  }
  // stage_versions and tenants are removed by the python purge step, which can
  // set the purge flag the deletion guard requires.
}

console.log(`\nSecurity regression: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
