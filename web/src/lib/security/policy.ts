/**
 * Security Policy Engine (M13 S1 — ADR-056). Central, versioned policy with
 * TIGHTEN-ONLY inheritance: platform default -> organization -> tenant, where a
 * narrower scope may only make a policy STRICTER, never weaker.
 *
 * The merge is a pure function so the inheritance rules are unit-testable and
 * identical everywhere they are evaluated. No DB access in this file.
 */

export type PolicyType = "password" | "mfa" | "session" | "login" | "ip" | "device" | "api" | "secret" | "data_access";
export type ScopeType = "platform" | "organization" | "tenant";

export interface PolicyLayer {
  scopeType: ScopeType;
  body: Record<string, unknown>;
}

/**
 * How each known key tightens. `max` = a higher value is stricter;
 * `min` = a lower value is stricter; `true` = enabling is stricter;
 * `union` = the union of listed requirements is stricter.
 */
const TIGHTEN: Record<string, "max" | "min" | "true" | "union"> = {
  // password
  min_length: "max",
  require_number: "true",
  require_symbol: "true",
  max_age_days: "min",
  // mfa
  required: "true",
  required_for_roles: "union",
  step_up_actions: "union",
  // session
  max_idle_minutes: "min",
  max_concurrent_sessions: "min",
  revoke_on_risk: "true",
  // login
  max_failed_attempts: "min",
  lockout_minutes: "max",
  step_up_on_new_device: "true",
  step_up_on_new_ip: "true",
  // api
  require_signature: "true",
  max_key_age_days: "min",
  enforce_ip_allowlist: "true",
  max_clock_skew_seconds: "min",
};

const SCOPE_ORDER: Record<ScopeType, number> = { platform: 0, organization: 1, tenant: 2 };

/** Pick the stricter of two values for a key. Unknown keys: narrower wins. */
export function tighten(key: string, base: unknown, override: unknown): unknown {
  if (override === undefined || override === null) return base;
  if (base === undefined || base === null) return override;
  switch (TIGHTEN[key]) {
    case "max":
      return Math.max(Number(base), Number(override));
    case "min":
      return Math.min(Number(base), Number(override));
    case "true":
      return Boolean(base) || Boolean(override);
    case "union": {
      const a = Array.isArray(base) ? base : [];
      const b = Array.isArray(override) ? override : [];
      return Array.from(new Set([...a, ...b]));
    }
    default:
      return override;
  }
}

/**
 * Merge policy layers into the effective policy. Layers are applied
 * platform -> organization -> tenant; a narrower layer can only tighten.
 * Returns both the effective body and which scope set each key.
 */
export function resolveEffectivePolicy(layers: PolicyLayer[]): {
  effective: Record<string, unknown>;
  origin: Record<string, ScopeType>;
} {
  const ordered = [...layers].sort((a, b) => SCOPE_ORDER[a.scopeType] - SCOPE_ORDER[b.scopeType]);
  const effective: Record<string, unknown> = {};
  const origin: Record<string, ScopeType> = {};

  for (const layer of ordered) {
    for (const [key, value] of Object.entries(layer.body ?? {})) {
      const before = effective[key];
      const after = tighten(key, before, value);
      // Record the origin only when this layer actually changed the outcome.
      if (before === undefined || JSON.stringify(before) !== JSON.stringify(after)) {
        origin[key] = layer.scopeType;
      }
      effective[key] = after;
    }
  }
  return { effective, origin };
}

/** True when a narrower layer would WEAKEN the inherited policy (rejected). */
export function violatesTightenOnly(
  inherited: Record<string, unknown>,
  proposed: Record<string, unknown>
): string[] {
  const violations: string[] = [];
  for (const [key, value] of Object.entries(proposed ?? {})) {
    if (!(key in inherited)) continue;
    const tightened = tighten(key, inherited[key], value);
    if (JSON.stringify(tightened) !== JSON.stringify(value)) {
      violations.push(key);
    }
  }
  return violations;
}

/* ------------------------------------------------------------------ */
/* Zero-Trust evaluation (ADR-055)                                     */
/* ------------------------------------------------------------------ */

export interface ZeroTrustContext {
  authenticated: boolean;
  /** Supabase assurance level: aal1 = password, aal2 = MFA satisfied. */
  aal: "aal1" | "aal2" | null;
  userRole: string | null;
  action: string;
  deviceKnown: boolean;
  ipKnown: boolean;
  sessionTrust: "normal" | "elevated" | "untrusted";
  riskScore: number; // 0..100
}

export type ZeroTrustDecision = "allow" | "step_up" | "deny";

export interface ZeroTrustResult {
  decision: ZeroTrustDecision;
  reasons: string[];
  requiredFactor?: "mfa";
}

/**
 * Evaluate a request against the effective policy. Pure and explainable:
 * every decision returns the exact reasons that produced it.
 */
export function evaluateZeroTrust(
  ctx: ZeroTrustContext,
  policy: { mfa?: Record<string, unknown>; login?: Record<string, unknown>; session?: Record<string, unknown> }
): ZeroTrustResult {
  const reasons: string[] = [];
  if (!ctx.authenticated) return { decision: "deny", reasons: ["not authenticated"] };

  if (ctx.sessionTrust === "untrusted") {
    return { decision: "deny", reasons: ["session trust was revoked"] };
  }

  const mfa = policy.mfa ?? {};
  const login = policy.login ?? {};

  const mfaRequired = Boolean(mfa.required);
  const roleRequires = Array.isArray(mfa.required_for_roles) && ctx.userRole
    ? (mfa.required_for_roles as string[]).includes(ctx.userRole)
    : false;
  const actionRequires = Array.isArray(mfa.step_up_actions)
    ? (mfa.step_up_actions as string[]).includes(ctx.action)
    : false;

  if ((mfaRequired || roleRequires) && ctx.aal !== "aal2") {
    reasons.push(roleRequires ? `MFA required for role ${ctx.userRole}` : "MFA required by policy");
    return { decision: "step_up", reasons, requiredFactor: "mfa" };
  }

  if (actionRequires && ctx.aal !== "aal2") {
    reasons.push(`action "${ctx.action}" requires step-up authentication`);
    return { decision: "step_up", reasons, requiredFactor: "mfa" };
  }

  if (login.step_up_on_new_device && !ctx.deviceKnown && ctx.aal !== "aal2") {
    reasons.push("unrecognised device");
    return { decision: "step_up", reasons, requiredFactor: "mfa" };
  }

  if (login.step_up_on_new_ip && !ctx.ipKnown && ctx.aal !== "aal2") {
    reasons.push("unrecognised network");
    return { decision: "step_up", reasons, requiredFactor: "mfa" };
  }

  // Risk-based: high risk forces re-verification, critical risk denies.
  if (ctx.riskScore >= 80) {
    reasons.push(`risk score ${ctx.riskScore} exceeds the deny threshold`);
    return { decision: "deny", reasons };
  }
  if (ctx.riskScore >= 50 && ctx.aal !== "aal2") {
    reasons.push(`elevated risk score ${ctx.riskScore}`);
    return { decision: "step_up", reasons, requiredFactor: "mfa" };
  }

  reasons.push("policy satisfied");
  return { decision: "allow", reasons };
}
