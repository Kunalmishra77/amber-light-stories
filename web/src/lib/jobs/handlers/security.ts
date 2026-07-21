import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeSecurityAudit } from "@/lib/security/audit";
import { runDetectors, type LoginSignal, type ApiSignal, type SecretSignal, type JobSignal } from "@/lib/security/threat";
import type { JobHandler } from "@/lib/jobs/types";

/**
 * Recurring security jobs (M13 S2/S3/S4) running on the M11 durable engine —
 * no separate scheduler. Each is idempotent and safe to re-run.
 */

/**
 * `security.pam_expire` — expire time-boxed privileged grants (ADR-051).
 * Elevated access can never outlive its window, even if nobody revokes it.
 */
export const pamExpireHandler: JobHandler = async () => {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data: expired } = await admin
    .from("privileged_grants")
    .select("id, tenant_id, user_id, permission_key, role_key")
    .in("status", ["approved", "active"])
    .lt("expires_at", now);

  const rows = (expired ?? []) as Array<{ id: string; tenant_id: string | null; user_id: string; permission_key: string | null; role_key: string | null }>;
  for (const g of rows) {
    await admin.from("privileged_grants").update({ status: "expired" }).eq("id", g.id);
    await writeSecurityAudit({
      tenantId: g.tenant_id,
      actorId: g.user_id,
      actorType: "system",
      action: "pam.grant_expired",
      target: `privileged_grant:${g.id}`,
      severity: "info",
      meta: { permission_key: g.permission_key, role_key: g.role_key },
    });
  }
  return { checkpoint: { expired: rows.length } };
};

/**
 * `security.vault_health` — recompute credential health/expiry (ADR-054).
 * Pure metadata: secret values are never read here.
 */
export const vaultHealthHandler: JobHandler = async (job) => {
  const admin = createAdminClient();
  const now = Date.now();

  let q = admin
    .from("tenant_credentials")
    .select("id, tenant_id, provider, expires_at, rotated_at, rotation_interval_days, health");
  if (job.tenant_id) q = q.eq("tenant_id", job.tenant_id);
  const { data } = await q;

  const rows = (data ?? []) as Array<{
    id: string; tenant_id: string; provider: string;
    expires_at: string | null; rotated_at: string | null;
    rotation_interval_days: number | null; health: string;
  }>;

  let updated = 0;
  const counts: Record<string, number> = { healthy: 0, expiring: 0, expired: 0, unknown: 0 };

  for (const c of rows) {
    let health = "healthy";
    if (c.expires_at) {
      const ms = Date.parse(c.expires_at) - now;
      if (ms <= 0) health = "expired";
      else if (ms <= 14 * 86_400_000) health = "expiring";
    } else if (c.rotation_interval_days && c.rotated_at) {
      const ageDays = (now - Date.parse(c.rotated_at)) / 86_400_000;
      if (ageDays > c.rotation_interval_days) health = "expired";
      else if (ageDays > c.rotation_interval_days * 0.85) health = "expiring";
    } else {
      health = "unknown";
    }
    counts[health] = (counts[health] ?? 0) + 1;

    if (health !== c.health) {
      await admin.from("tenant_credentials").update({ health, last_checked_at: new Date().toISOString() }).eq("id", c.id);
      updated++;
      if (health === "expired" || health === "expiring") {
        await writeSecurityAudit({
          tenantId: c.tenant_id,
          actorType: "system",
          action: "vault.credential_health_changed",
          target: `credential:${c.provider}`,
          severity: health === "expired" ? "critical" : "warning",
          meta: { provider: c.provider, health },
        });
      }
    }
  }
  return { checkpoint: { checked: rows.length, updated, ...counts } };
};

/**
 * `security.threat_scan` — run the rules-based detectors over signals the
 * platform already records, and persist explainable findings (ADR-058).
 * Findings are deduplicated per (tenant, detector, open) so repeat scans do
 * not spam the Security Center.
 */
export const threatScanHandler: JobHandler = async (job) => {
  const admin = createAdminClient();
  const now = Date.now();
  const since = new Date(now - 24 * 3600 * 1000).toISOString();
  const tenantId = job.tenant_id;

  // Signals — all from existing tables.
  const [apiRes, credRes, jobRes, devRes] = await Promise.all([
    admin.from("api_request_log").select("api_key_id, status, path, created_at").gte("created_at", since).limit(5000),
    admin.from("credential_access_log").select("provider, actor_id, outcome, created_at").gte("created_at", since).limit(2000),
    admin.from("jobs").select("type, status, updated_at").gte("updated_at", since).limit(2000),
    admin.from("trusted_devices").select("device_fingerprint"),
  ]);

  const api: ApiSignal[] = ((apiRes.data ?? []) as Array<{ api_key_id: string | null; status: number | null; path: string | null; created_at: string }>)
    .filter((r) => r.api_key_id)
    .map((r) => ({ apiKeyId: r.api_key_id as string, at: Date.parse(r.created_at), status: r.status ?? 0, path: r.path }));
  const secrets: SecretSignal[] = ((credRes.data ?? []) as Array<{ provider: string; actor_id: string | null; outcome: string; created_at: string }>)
    .map((r) => ({ provider: r.provider, actorId: r.actor_id, at: Date.parse(r.created_at), outcome: r.outcome === "denied" ? "denied" : "granted" }));
  const jobs: JobSignal[] = ((jobRes.data ?? []) as Array<{ type: string; status: string; updated_at: string }>)
    .map((r) => ({ type: r.type, status: r.status, at: Date.parse(r.updated_at) }));
  const knownDevices = new Set(
    ((devRes.data ?? []) as Array<{ device_fingerprint: string }>).map((d) => d.device_fingerprint)
  );

  // Login signals come from the audit trail (no separate login table).
  const { data: loginRows } = await admin
    .from("security_audit")
    .select("actor_id, action, meta, created_at")
    .in("action", ["auth.login_failed", "auth.login_succeeded"])
    .gte("created_at", since)
    .limit(5000);
  const logins: LoginSignal[] = ((loginRows ?? []) as Array<{ actor_id: string | null; action: string; meta: Record<string, unknown>; created_at: string }>)
    .filter((r) => r.actor_id)
    .map((r) => ({
      userId: r.actor_id as string,
      success: r.action === "auth.login_succeeded",
      at: Date.parse(r.created_at),
      ip: (r.meta?.ip as string) ?? null,
      deviceFingerprint: (r.meta?.device as string) ?? null,
    }));

  const findings = runDetectors({ logins, api, secrets, jobs, knownDevices, now });

  let created = 0;
  for (const f of findings) {
    const { data: existing } = await admin
      .from("threat_findings")
      .select("id")
      .eq("detector", f.detector)
      .eq("status", "open")
      .is("tenant_id", tenantId ?? null)
      .maybeSingle();
    if (existing) continue;

    await admin.from("threat_findings").insert({
      tenant_id: tenantId,
      detector: f.detector,
      severity: f.severity,
      title: f.title,
      evidence: f.evidence,
      recommended_action: f.recommendedAction,
    });
    created++;
    await writeSecurityAudit({
      tenantId,
      actorType: "system",
      action: "threat.finding_raised",
      target: `detector:${f.detector}`,
      severity: f.severity === "critical" ? "critical" : "warning",
      meta: { title: f.title, evidence: f.evidence },
    });
  }

  return { checkpoint: { signals: { logins: logins.length, api: api.length, secrets: secrets.length, jobs: jobs.length }, findings: findings.length, created } };
};

/**
 * `security.break_glass_expire` — force-expire emergency access windows
 * (ADR-059). Emergency access must never silently persist.
 */
export const breakGlassExpireHandler: JobHandler = async () => {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data } = await admin
    .from("break_glass_requests")
    .select("id, tenant_id, requested_by")
    .in("status", ["approved", "active"])
    .lt("expires_at", now);

  const rows = (data ?? []) as Array<{ id: string; tenant_id: string | null; requested_by: string }>;
  for (const r of rows) {
    await admin.from("break_glass_requests").update({ status: "expired", closed_at: now }).eq("id", r.id);
    await writeSecurityAudit({
      tenantId: r.tenant_id,
      actorId: r.requested_by,
      actorType: "system",
      action: "break_glass.expired",
      target: `break_glass:${r.id}`,
      severity: "warning",
      meta: { auto_expired: true },
    });
  }
  return { checkpoint: { expired: rows.length } };
};
