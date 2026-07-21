import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { ingestTenantAnalytics } from "@/lib/analytics/ingest";
import type { AnalyticsMode } from "@/lib/analytics/types";

/**
 * Cron-driven analytics ingestion across all active tenants (M10 / ISS-P3-05).
 * Uses the service-role client (no user session) and writes tenant-scoped rows
 * with explicit `tenant_id`. DRY by default ($0, no external calls) — flips to
 * live per-tenant once real YouTube credentials are connected + authorized.
 */
export interface AnalyticsRunSummary {
  tenants: number;
  ingested: number;
  failed: number;
  mode: AnalyticsMode;
}

export async function runAnalyticsIngestion(mode: AnalyticsMode = "dry"): Promise<AnalyticsRunSummary> {
  const admin = createAdminClient();
  const { data: tenants } = await admin.from("tenants").select("id").eq("status", "active");

  let ingested = 0;
  let failed = 0;
  const list = (tenants ?? []) as { id: string }[];

  for (const tenant of list) {
    try {
      const result = await ingestTenantAnalytics({ tenantId: tenant.id, mode, client: admin });
      ingested += result.ingested;
      failed += result.failed;
    } catch {
      failed++;
    }
  }

  return { tenants: list.length, ingested, failed, mode };
}
