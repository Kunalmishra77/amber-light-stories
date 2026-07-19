import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface UsageCounters {
  period: string;
  videos: number;
  ai_calls: number;
  storage_bytes: number;
  cost_usd: number;
}

/** Rough per-asset size estimate — no real file-size column is tracked yet. */
const ASSET_SIZE_ESTIMATE_BYTES = 1_500_000;

/** Current UTC calendar-month period key, e.g. "2026-07". */
export function currentPeriod(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function periodBounds(period: string): { start: string; end: string } {
  const [year, month] = period.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1)).toISOString();
  const end = new Date(Date.UTC(year, month, 1)).toISOString();
  return { start, end };
}

/**
 * Recomputes `usage_counters` for a tenant/period from source-of-truth
 * tables (videos, api_usage, assets) and upserts the result. $0 — pure
 * counting/summing, no paid API calls. Returns the freshly computed
 * counters, or null on any read/write failure (never throws).
 */
export async function rollupUsage(
  tenantId: string,
  period: string = currentPeriod()
): Promise<UsageCounters | null> {
  try {
    const supabase = await createClient();
    const { start, end } = periodBounds(period);

    const [videosRes, apiUsageCountRes, apiUsageCostRes, assetsRes] = await Promise.all([
      supabase
        .from("videos")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .gte("created_at", start)
        .lt("created_at", end),
      supabase
        .from("api_usage")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .gte("created_at", start)
        .lt("created_at", end),
      supabase
        .from("api_usage")
        .select("cost_usd")
        .eq("tenant_id", tenantId)
        .gte("created_at", start)
        .lt("created_at", end),
      supabase
        .from("assets")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .gte("created_at", start)
        .lt("created_at", end),
    ]);

    const costUsd = (apiUsageCostRes.data ?? []).reduce(
      (sum, row: { cost_usd: number | null }) => sum + (Number(row.cost_usd) || 0),
      0
    );

    const counters: UsageCounters = {
      period,
      videos: videosRes.count ?? 0,
      ai_calls: apiUsageCountRes.count ?? 0,
      storage_bytes: (assetsRes.count ?? 0) * ASSET_SIZE_ESTIMATE_BYTES,
      cost_usd: costUsd,
    };

    await supabase.from("usage_counters").upsert(
      {
        tenant_id: tenantId,
        period: counters.period,
        videos: counters.videos,
        ai_calls: counters.ai_calls,
        storage_bytes: counters.storage_bytes,
        cost_usd: counters.cost_usd,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,period" }
    );

    return counters;
  } catch {
    return null;
  }
}

/** Reads the stored `usage_counters` row for a tenant/period, if any. */
export async function getUsage(
  tenantId: string,
  period: string = currentPeriod()
): Promise<UsageCounters | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("usage_counters")
      .select("period, videos, ai_calls, storage_bytes, cost_usd")
      .eq("tenant_id", tenantId)
      .eq("period", period)
      .maybeSingle<UsageCounters>();
    return data ?? null;
  } catch {
    return null;
  }
}
