import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Tamper-evident security audit (M13 S5 — ADR-052). Writes go through the
 * service role only: `security_audit` has no INSERT policy for authenticated
 * users, so a user can never author or forge an entry. The hash chain
 * (seq/prev_hash/hash) is built by a DB trigger, so it cannot be supplied by
 * the caller either.
 *
 * Never throws — losing an audit write must not break the operation, but the
 * failure is surfaced in the return value so callers can escalate.
 */
export type AuditSeverity = "info" | "warning" | "critical";
export type ActorType = "user" | "service_account" | "api_key" | "system";

export interface SecurityAuditInput {
  tenantId?: string | null;
  actorId?: string | null;
  actorType?: ActorType;
  action: string;
  target?: string | null;
  severity?: AuditSeverity;
  meta?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

export async function writeSecurityAudit(
  input: SecurityAuditInput,
  client?: SupabaseClient
): Promise<{ ok: boolean; error?: string }> {
  try {
    const admin = client ?? createAdminClient();
    const { error } = await admin.from("security_audit").insert({
      tenant_id: input.tenantId ?? null,
      actor_id: input.actorId ?? null,
      actor_type: input.actorType ?? "system",
      action: input.action,
      target: input.target ?? null,
      severity: input.severity ?? "info",
      meta: input.meta ?? {},
      ip: input.ip ?? null,
      user_agent: input.userAgent ?? null,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "audit write failed" };
  }
}

export interface ChainVerification {
  ok: boolean;
  checked: number;
  firstBadSeq: number | null;
  reason: string;
}

/**
 * Verify a chain end-to-end by recomputing every hash in the database (the
 * verification runs server-side in SQL so it cannot be faked client-side).
 */
export async function verifyAuditChain(
  tenantId: string | null,
  client?: SupabaseClient
): Promise<ChainVerification> {
  const admin = client ?? createAdminClient();
  const { data, error } = await admin.rpc("verify_security_audit_chain", { p_tenant: tenantId });
  if (error) return { ok: false, checked: 0, firstBadSeq: null, reason: error.message };
  const row = (Array.isArray(data) ? data[0] : data) as
    | { ok: boolean; checked: number; first_bad_seq: number | null; reason: string }
    | undefined;
  if (!row) return { ok: true, checked: 0, firstBadSeq: null, reason: "empty chain" };
  return { ok: row.ok, checked: Number(row.checked), firstBadSeq: row.first_bad_seq, reason: row.reason };
}
