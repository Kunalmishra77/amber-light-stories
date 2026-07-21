import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueue } from "@/lib/jobs/engine";
import type { AnalyticsMode } from "@/lib/analytics/types";

/**
 * Cron-driven analytics ingestion across all active tenants (M10 / ISS-P3-05),
 * durable since M11 Phase B: this ENQUEUES one `analytics.ingest` job per
 * tenant rather than ingesting inline, so a failed pull retries with backoff
 * and dead-letters after exhaustion instead of being silently lost.
 *
 * Idempotent per (tenant, UTC day): repeated cron ticks converge on the same
 * job, and the ingestion itself is idempotent per (video, day).
 */
export interface AnalyticsRunSummary {
  tenants: number;
  enqueued: number;
  skipped: number;
  errors: number;
  mode: AnalyticsMode;
  periodDate: string;
}

/** Deterministic key: one ingestion job per tenant per UTC day. */
export function analyticsJobKey(tenantId: string, periodDate: string): string {
  return `analytics:ingest:${tenantId}:${periodDate}`;
}

export async function runAnalyticsIngestion(mode: AnalyticsMode = "dry"): Promise<AnalyticsRunSummary> {
  const admin = createAdminClient();
  const periodDate = new Date().toISOString().slice(0, 10);
  const { data: tenants } = await admin.from("tenants").select("id").eq("status", "active");
  const list = (tenants ?? []) as { id: string }[];

  let enqueued = 0;
  let skipped = 0;
  let errors = 0;

  for (const tenant of list) {
    const idempotencyKey = analyticsJobKey(tenant.id, periodDate);
    try {
      const { data: existing } = await admin
        .from("jobs")
        .select("id")
        .eq("tenant_id", tenant.id)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (existing) {
        skipped++;
        continue;
      }
      await enqueue(
        {
          tenantId: tenant.id,
          type: "analytics.ingest",
          idempotencyKey,
          payload: { mode, periodDate },
        },
        admin
      );
      enqueued++;
    } catch {
      errors++;
    }
  }

  return { tenants: list.length, enqueued, skipped, errors, mode, periodDate };
}
