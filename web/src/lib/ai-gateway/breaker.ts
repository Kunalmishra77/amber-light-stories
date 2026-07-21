import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ProviderKey } from "@/lib/providers/registry";

/**
 * Provider circuit breakers (M11 Phase E, ADR-033) built on the EXISTING
 * AI Gateway health store (`provider_health`) — no duplicate health system.
 *
 * The breaker is derived, not stored separately:
 *   closed     — healthy/degraded: use the provider.
 *   open       — status 'down' (>= OPEN_AFTER consecutive failures) and the
 *                cool-off has not elapsed: fail fast, do NOT call the provider.
 *   half-open  — 'down' but the cool-off elapsed: allow ONE trial call; a
 *                success resets health (closing the circuit), a failure
 *                re-opens it via the normal failure hook.
 */
export type CircuitState = "closed" | "open" | "half-open";

/** provider_health flips to 'down' at this many consecutive failures. */
export const OPEN_AFTER = 3;
/** How long an open circuit waits before allowing a trial call. */
export const COOL_OFF_MS = 60_000;

/** Pure decision function — unit-testable without a database. */
export function circuitStateFrom(
  health: { status?: string | null; last_error_at?: string | null } | null,
  nowMs: number,
  coolOffMs: number = COOL_OFF_MS
): CircuitState {
  if (!health || health.status !== "down") return "closed";
  const lastError = health.last_error_at ? Date.parse(health.last_error_at) : NaN;
  if (!Number.isFinite(lastError)) return "open";
  return nowMs - lastError >= coolOffMs ? "half-open" : "open";
}

/** Read the live circuit state for a provider (platform-wide health row). */
export async function getCircuitState(provider: ProviderKey): Promise<CircuitState> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("provider_health")
      .select("status, last_error_at")
      .eq("provider", provider)
      .is("tenant_id", null)
      .maybeSingle();
    return circuitStateFrom(data as { status?: string; last_error_at?: string } | null, Date.now());
  } catch {
    // Never let breaker lookup failures block execution.
    return "closed";
  }
}

/** True when the provider must NOT be called right now. */
export async function isCircuitOpen(provider: ProviderKey): Promise<boolean> {
  return (await getCircuitState(provider)) === "open";
}
