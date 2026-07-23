import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { ingestTenantAnalytics } from "@/lib/analytics/ingest";
import type { AnalyticsMode } from "@/lib/analytics/types";
import type { JobHandler } from "@/lib/jobs/types";

/**
 * `analytics.ingest` job handler (M11-1). Reuses the REAL analytics ingestion
 * (no duplicated logic). Tenant scope comes from `job.tenant_id` — the
 * authoritative isolation boundary — never from the payload. Idempotency is
 * preserved by the underlying ingestion (one analytics row per video+day).
 * Payload only carries execution options (mode / periodDate).
 */
export const analyticsIngestHandler: JobHandler = async (job) => {
  if (!job.tenant_id) throw new Error("analytics.ingest job is missing tenant_id");

  const payload = job.payload ?? {};
  const periodDate = typeof payload.periodDate === "string" ? payload.periodDate : undefined;
  const admin = createAdminClient();

  // Live vs dry is derived from REAL state per tenant, never the payload: a
  // workspace gets REAL analytics once it has connected its own YouTube channel
  // (whose OAuth carries the yt-analytics scope). No channel → deterministic dry
  // fixtures, clearly labelled. Any doubt resolves to dry.
  let mode: AnalyticsMode = (payload.mode as AnalyticsMode) ?? "dry";
  if (mode === "live" || mode === "dry") {
    const { data: channel } = await admin
      .from("channels")
      .select("id")
      .eq("tenant_id", job.tenant_id)
      .eq("provider", "youtube")
      .eq("status", "connected")
      .maybeSingle();
    mode = channel ? "live" : "dry";
  }

  // Service-role client so the durable runner works without a user session;
  // ingestion scopes every write by the passed tenantId.
  const result = await ingestTenantAnalytics({
    tenantId: job.tenant_id,
    mode,
    periodDate,
    client: admin,
  });

  return { checkpoint: { ...result } };
};
