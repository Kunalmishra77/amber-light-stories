import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Only set when `allowed` is false — seconds until the current window rolls over. */
  retryAfterSeconds?: number;
}

/**
 * Fixed-window rate limiter backed by `rate_limits` (bucketed by
 * floor(now / windowSeconds), unique on tenant_id+action+window_start).
 * Best-effort: on any infra error this fails OPEN (allowed: true) so a
 * limiter hiccup never blocks the primary action.
 *
 * Not perfectly race-free under heavy concurrency (read-then-write), which
 * is fine for the soft, per-tenant guards this is used for (credential
 * validation, plan generation) — not a hard billing enforcement point.
 *
 * `client` defaults to the cookie-authed (RLS) client. Pass the service-role
 * admin client explicitly for callers with no signed-in session (e.g. the
 * token-gated, unauthenticated onboarding wizard) — otherwise RLS blocks
 * the read/write and the limiter silently fails open.
 */
export async function checkRateLimit(
  tenantId: string,
  action: string,
  limit: number,
  windowSeconds: number,
  client?: SupabaseClient
): Promise<RateLimitResult> {
  try {
    const supabase = client ?? (await createClient());
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const windowStartMs = Math.floor(now / windowMs) * windowMs;
    const windowStart = new Date(windowStartMs).toISOString();

    const { data: existing } = await supabase
      .from("rate_limits")
      .select("id, count")
      .eq("tenant_id", tenantId)
      .eq("action", action)
      .eq("window_start", windowStart)
      .maybeSingle<{ id: string; count: number }>();

    const currentCount = existing?.count ?? 0;

    if (currentCount >= limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((windowStartMs + windowMs - now) / 1000)),
      };
    }

    if (existing) {
      await supabase
        .from("rate_limits")
        .update({ count: currentCount + 1 })
        .eq("id", existing.id);
    } else {
      await supabase.from("rate_limits").insert({
        tenant_id: tenantId,
        action,
        window_start: windowStart,
        count: 1,
      });
    }

    return { allowed: true, remaining: Math.max(0, limit - currentCount - 1) };
  } catch {
    return { allowed: true, remaining: limit };
  }
}

export const RATE_LIMIT_MESSAGE = "Too many requests, try again shortly.";
