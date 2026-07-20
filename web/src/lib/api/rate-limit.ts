import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Rate-limit hook for the public API (M8 / P2-12). Pure decision function
 * (unit-tested) plus a DB-backed sliding-window check over `api_request_log`.
 * The window is a simple trailing 60 seconds — cheap, correct enough for a
 * per-key ceiling, and swappable for a Redis/edge counter later without
 * changing callers.
 */
export function isOverLimit(countInWindow: number, limitPerMin: number): boolean {
  return limitPerMin > 0 && countInWindow >= limitPerMin;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds to wait before retrying, when throttled. */
  retryAfter?: number;
  limit: number;
  remaining: number;
}

export async function enforceRateLimit(
  admin: SupabaseClient,
  apiKeyId: string,
  limitPerMin: number
): Promise<RateLimitResult> {
  const windowStart = new Date(Date.now() - 60_000).toISOString();
  const { count } = await admin
    .from("api_request_log")
    .select("*", { count: "exact", head: true })
    .eq("api_key_id", apiKeyId)
    .gte("created_at", windowStart);

  const used = count ?? 0;
  if (isOverLimit(used, limitPerMin)) {
    return { allowed: false, retryAfter: 60, limit: limitPerMin, remaining: 0 };
  }
  return { allowed: true, limit: limitPerMin, remaining: Math.max(0, limitPerMin - used - 1) };
}
