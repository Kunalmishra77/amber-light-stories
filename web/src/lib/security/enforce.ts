import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile, getCurrentTenantId, getCurrentMembership } from "@/lib/auth";
import { evaluateZeroTrust, resolveEffectivePolicy, type PolicyLayer, type ZeroTrustResult } from "@/lib/security/policy";
import { writeSecurityAudit } from "@/lib/security/audit";

/**
 * Universal Zero-Trust enforcement (M13 closeout — ADR-055/056).
 *
 * M13 shipped the policy ENGINE but only wired it into the API-key path. This
 * is the server-action/route enforcement point: it resolves the effective
 * policy (platform -> organization -> tenant, tighten-only), evaluates the
 * request context, and returns allow / step_up / deny — auditing every denial
 * and step-up so enforcement is provable.
 *
 * Fail-closed on infrastructure errors for sensitive actions; policy lookups
 * are cached per request by React `cache()` upstream in getProfile/membership.
 */
export interface EnforceResult {
  allowed: boolean;
  decision: ZeroTrustResult["decision"];
  reasons: string[];
  requiresStepUp: boolean;
}

/** Load the policy layers that apply to the caller and merge tighten-only. */
async function effectivePolicies(tenantId: string | null): Promise<Record<string, Record<string, unknown>>> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("security_policies")
    .select("policy_type, scope_type, scope_id, security_policy_versions!security_policies_active_version_fk(body)")
    .or(tenantId ? `scope_type.eq.platform,scope_id.eq.${tenantId}` : "scope_type.eq.platform");

  const byType: Record<string, PolicyLayer[]> = {};
  for (const row of (data ?? []) as Array<{
    policy_type: string;
    scope_type: string;
    security_policy_versions: { body: Record<string, unknown> } | { body: Record<string, unknown> }[] | null;
  }>) {
    const v = Array.isArray(row.security_policy_versions)
      ? row.security_policy_versions[0]
      : row.security_policy_versions;
    if (!v?.body) continue;
    (byType[row.policy_type] ??= []).push({
      scopeType: row.scope_type as PolicyLayer["scopeType"],
      body: v.body,
    });
  }

  const out: Record<string, Record<string, unknown>> = {};
  for (const [type, layers] of Object.entries(byType)) {
    out[type] = resolveEffectivePolicy(layers).effective;
  }
  return out;
}

/**
 * Enforce Zero-Trust for a server action or route.
 *
 * `action` is the permission-ish key used by MFA step-up policy
 * (e.g. "credentials.update"). Callers should treat `allowed === false` as a
 * hard stop and surface `reasons` to the operator.
 */
export async function enforceZeroTrust(
  action: string,
  opts?: { tenantId?: string | null; aal?: "aal1" | "aal2" | null; deviceKnown?: boolean; ipKnown?: boolean; riskScore?: number }
): Promise<EnforceResult> {
  const profile = await getProfile();
  if (!profile) {
    return { allowed: false, decision: "deny", reasons: ["not authenticated"], requiresStepUp: false };
  }

  const tenantId = opts?.tenantId ?? (await getCurrentTenantId());
  const membership = await getCurrentMembership(tenantId);
  const role = profile.is_super_admin ? "super_admin" : membership?.role ?? null;

  let policies: Record<string, Record<string, unknown>> = {};
  try {
    policies = await effectivePolicies(tenantId);
  } catch {
    // Fail CLOSED for a sensitive action if policy cannot be resolved.
    return {
      allowed: false,
      decision: "deny",
      reasons: ["security policy could not be evaluated"],
      requiresStepUp: false,
    };
  }

  const result = evaluateZeroTrust(
    {
      authenticated: true,
      aal: opts?.aal ?? "aal1",
      userRole: role,
      action,
      deviceKnown: opts?.deviceKnown ?? true,
      ipKnown: opts?.ipKnown ?? true,
      sessionTrust: "normal",
      riskScore: opts?.riskScore ?? 0,
    },
    { mfa: policies.mfa, login: policies.login, session: policies.session }
  );

  // Every non-allow outcome is auditable evidence that enforcement happened.
  if (result.decision !== "allow") {
    await writeSecurityAudit({
      tenantId,
      actorId: profile.user_id,
      actorType: "user",
      action: `zero_trust.${result.decision}`,
      target: action,
      severity: result.decision === "deny" ? "warning" : "info",
      meta: { reasons: result.reasons, role },
    });
  }

  return {
    allowed: result.decision === "allow",
    decision: result.decision,
    reasons: result.reasons,
    requiresStepUp: result.decision === "step_up",
  };
}

/** Throwing variant for server actions that should abort outright. */
export class ZeroTrustDeniedError extends Error {
  readonly decision: ZeroTrustResult["decision"];
  constructor(result: EnforceResult) {
    super(
      result.requiresStepUp
        ? `Additional verification required: ${result.reasons.join("; ")}`
        : `Request denied: ${result.reasons.join("; ")}`
    );
    this.name = "ZeroTrustDeniedError";
    this.decision = result.decision;
  }
}

export async function requireZeroTrust(
  action: string,
  opts?: Parameters<typeof enforceZeroTrust>[1]
): Promise<void> {
  const result = await enforceZeroTrust(action, opts);
  if (!result.allowed) throw new ZeroTrustDeniedError(result);
}
