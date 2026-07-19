import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/auth";

export type EventLevel = "info" | "warn" | "error";

/**
 * Inserts an `event_log` row — the system/observability trail surfaced on
 * /admin/observability (cross-tenant) and /logs (tenant-scoped). Distinct
 * from `logAudit`: audit_log is "who did what", event_log is "what
 * happened" (including system-triggered events with no actor).
 *
 * Never throws — logging a failure should never cause a second failure.
 */
export async function logEvent(opts: {
  level?: EventLevel;
  source: string;
  message: string;
  meta?: Record<string, unknown>;
  tenantId?: string | null;
}): Promise<void> {
  try {
    const tenantId = opts.tenantId ?? (await getCurrentTenantId());
    const supabase = await createClient();
    await supabase.from("event_log").insert({
      tenant_id: tenantId,
      level: opts.level ?? "info",
      source: opts.source,
      message: opts.message,
      meta: opts.meta ?? {},
    });
  } catch {
    // Best-effort.
  }
}
