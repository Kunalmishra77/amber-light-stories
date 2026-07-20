import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { currentPeriod } from "@/lib/ops/usage";

/**
 * Plan entitlement + quota enforcement (M6 / ISS-B4, ADR-004). Reads the
 * tenant's active plan limits and enforces them server-side BEFORE a gated
 * action runs. No payment processor is required for enforcement (Stripe
 * integration is M9); this gates on the plan already assigned.
 */
export interface PlanLimits {
  videos_month?: number;
  ai_credits?: number;
  [key: string]: number | undefined;
}

/** Fallback (Free) limits — used when a tenant has no active subscription. */
const FREE_LIMITS: PlanLimits = { videos_month: 10, ai_credits: 50 };

export class QuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuotaExceededError";
  }
}

/** The tenant's active plan limits (subscription → plan.limits), else Free. */
export async function getTenantLimits(
  tenantId: string,
  client?: SupabaseClient
): Promise<PlanLimits> {
  const supabase = client ?? (await createClient());
  const { data } = await supabase
    .from("subscriptions")
    .select("status, plans(limits)")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .maybeSingle();
  const plansField = (data as { plans?: unknown } | null)?.plans;
  const plan = Array.isArray(plansField) ? plansField[0] : plansField;
  const limits = (plan as { limits?: PlanLimits } | null)?.limits ?? {};
  return { ...FREE_LIMITS, ...limits };
}

export interface QuotaCheck {
  allowed: boolean;
  limit: number;
  used: number;
  remaining: number;
  reason?: string;
}

/**
 * Monthly generation quota: pipeline runs created in the current UTC month vs
 * the plan's `videos_month` limit. Enforced before every generation (M4
 * engine + M5 scheduler) so no tenant exceeds its plan.
 */
export async function checkGenerationQuota(
  tenantId: string,
  client?: SupabaseClient
): Promise<QuotaCheck> {
  const supabase = client ?? (await createClient());
  const limits = await getTenantLimits(tenantId, supabase);
  const limit = limits.videos_month ?? FREE_LIMITS.videos_month!;

  const [y, m] = currentPeriod().split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1)).toISOString();
  const end = new Date(Date.UTC(y, m, 1)).toISOString();
  const { count } = await supabase
    .from("pipeline_runs")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .gte("started_at", start)
    .lt("started_at", end);

  const used = count ?? 0;
  const remaining = Math.max(0, limit - used);
  return {
    allowed: used < limit,
    limit,
    used,
    remaining,
    reason:
      used < limit
        ? undefined
        : `Monthly generation limit reached (${used}/${limit}). Upgrade your plan for more.`,
  };
}
