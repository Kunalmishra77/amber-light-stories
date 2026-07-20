import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ProviderKey } from "@/lib/providers/registry";

/**
 * Provider health monitoring hooks for the AI Gateway (ISS-P2-06). The gateway
 * calls these around every adapter execution. Health is written via the
 * service-role client (the execution path has no auth.uid()); `provider_health`
 * RLS governs only authed-session reads. Never throws — a health-write failure
 * must not break the operation it describes.
 *
 * `tenantId` NULL = platform-wide health (the default the console shows).
 */
export type ProviderStatus = "healthy" | "degraded" | "down" | "unknown";

/** Degrade to "down" once failures pile up; a single failure is "degraded". */
function statusForFailures(consecutive: number): ProviderStatus {
  if (consecutive <= 0) return "healthy";
  if (consecutive >= 3) return "down";
  return "degraded";
}

async function loadRow(provider: ProviderKey, tenantId: string | null) {
  const admin = createAdminClient();
  let q = admin
    .from("provider_health")
    .select("id, consecutive_failures")
    .eq("provider", provider);
  q = tenantId === null ? q.is("tenant_id", null) : q.eq("tenant_id", tenantId);
  const { data } = await q.maybeSingle();
  return data as { id: string; consecutive_failures: number } | null;
}

export async function recordProviderSuccess(
  provider: ProviderKey,
  tenantId: string | null = null
): Promise<void> {
  try {
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const existing = await loadRow(provider, tenantId);
    if (existing) {
      await admin
        .from("provider_health")
        .update({ status: "healthy", consecutive_failures: 0, last_ok_at: now, checked_at: now, updated_at: now })
        .eq("id", existing.id);
    } else {
      await admin.from("provider_health").insert({
        provider,
        tenant_id: tenantId,
        status: "healthy",
        consecutive_failures: 0,
        last_ok_at: now,
        checked_at: now,
      });
    }
  } catch {
    // best-effort
  }
}

export async function recordProviderFailure(
  provider: ProviderKey,
  error: string,
  tenantId: string | null = null
): Promise<void> {
  try {
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const existing = await loadRow(provider, tenantId);
    const consecutive = (existing?.consecutive_failures ?? 0) + 1;
    const status = statusForFailures(consecutive);
    if (existing) {
      await admin
        .from("provider_health")
        .update({ status, consecutive_failures: consecutive, last_error_at: now, last_error: error.slice(0, 500), checked_at: now, updated_at: now })
        .eq("id", existing.id);
    } else {
      await admin.from("provider_health").insert({
        provider,
        tenant_id: tenantId,
        status,
        consecutive_failures: consecutive,
        last_error_at: now,
        last_error: error.slice(0, 500),
        checked_at: now,
      });
    }
  } catch {
    // best-effort
  }
}

export { statusForFailures };
