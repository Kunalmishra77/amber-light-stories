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
const FREE_LIMITS: PlanLimits = { videos_month: 10, ai_credits: 50, monthly_cost_usd: 25 };

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

/**
 * Engine-level cost governor (M11 Phase E, ADR-032). Sums the tenant's metered
 * spend for the current UTC month from the EXISTING `api_usage` ledger (the
 * same ledger the AI Gateway writes to — no duplicate cost store) and compares
 * it with the plan's `monthly_cost_usd` budget.
 *
 * Enforced BEFORE a paid job runs, so an over-budget tenant fails safely and
 * terminally instead of retrying into a larger bill. Dry runs record $0, so
 * this never blocks dry execution.
 */
export async function checkTenantBudget(
  tenantId: string,
  client?: SupabaseClient
): Promise<QuotaCheck & { spentUsd: number; budgetUsd: number }> {
  const supabase = client ?? (await createClient());
  const limits = await getTenantLimits(tenantId, supabase);
  const budgetUsd = limits.monthly_cost_usd ?? FREE_LIMITS.monthly_cost_usd!;

  const [y, m] = currentPeriod().split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1)).toISOString();
  const end = new Date(Date.UTC(y, m, 1)).toISOString();
  const { data } = await supabase
    .from("api_usage")
    .select("cost_usd")
    .eq("tenant_id", tenantId)
    .gte("created_at", start)
    .lt("created_at", end);

  const spentUsd = ((data ?? []) as { cost_usd: number | null }[]).reduce(
    (sum, r) => sum + (r.cost_usd ?? 0),
    0
  );
  const allowed = spentUsd < budgetUsd;
  return {
    allowed,
    limit: budgetUsd,
    used: spentUsd,
    remaining: Math.max(0, budgetUsd - spentUsd),
    spentUsd,
    budgetUsd,
    reason: allowed
      ? undefined
      : `Monthly cost budget exhausted ($${spentUsd.toFixed(2)}/$${budgetUsd.toFixed(2)}).`,
  };
}
