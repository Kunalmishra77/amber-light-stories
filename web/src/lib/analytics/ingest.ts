import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/ops/audit";
import { getTenantCredential } from "@/lib/providers/tenant-providers";
import { resolveAnalyticsAdapter } from "@/lib/analytics/registry";
import { type AnalyticsMode, type AnalyticsProvider } from "@/lib/analytics/types";

/**
 * Analytics ingestion (M10 / ISS-P3-05, v1.0 loop step 7). Pulls per-video
 * metrics for a tenant's published videos through a provider-abstracted adapter
 * and persists them to `analytics`, strictly tenant-scoped and idempotent (one
 * row per video+day; a re-run updates in place, never duplicates).
 *
 * Provenance is explicit: `source` = the mode. "dry" fixtures are stored as
 * 'dry' and surfaced as sample data — never as real analytics.
 */
export interface IngestResult {
  ingested: number;
  failed: number;
  videos: number;
  mode: AnalyticsMode;
  periodDate: string;
}

/** UTC day (YYYY-MM-DD) — the snapshot period. */
function utcDay(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export async function ingestTenantAnalytics(opts: {
  tenantId: string;
  mode?: AnalyticsMode;
  provider?: AnalyticsProvider;
  client?: SupabaseClient;
  periodDate?: string;
}): Promise<IngestResult> {
  const { tenantId } = opts;
  const mode: AnalyticsMode = opts.mode ?? "dry";
  const provider: AnalyticsProvider = opts.provider ?? "youtube";
  const periodDate = opts.periodDate ?? utcDay();
  const supabase = opts.client ?? (await createClient());

  const adapter = resolveAnalyticsAdapter(provider, mode);
  if (!adapter) {
    return { ingested: 0, failed: 0, videos: 0, mode, periodDate };
  }

  // The tenant's OWN published videos (tenant-scoped) with an external id.
  const { data: videos } = await supabase
    .from("videos")
    .select("id, yt_video_id")
    .eq("tenant_id", tenantId)
    .eq("status", "published")
    .not("yt_video_id", "is", null);

  const rows = (videos ?? []) as { id: string; yt_video_id: string | null }[];
  const credential = mode === "live" ? await getTenantCredential(tenantId, provider) : null;

  let ingested = 0;
  let failed = 0;

  for (const video of rows) {
    if (!video.yt_video_id) continue;
    try {
      const metrics = await adapter.fetchVideoMetrics({
        externalVideoId: video.yt_video_id,
        credential,
        periodDate,
      });

      const record = {
        tenant_id: tenantId,
        video_id: video.id,
        provider,
        external_video_id: video.yt_video_id,
        period_date: periodDate,
        views: metrics.views,
        impressions: metrics.impressions,
        ctr: metrics.ctr,
        avg_view_pct: metrics.avgViewPct,
        watch_hours: metrics.watchHours,
        likes: metrics.likes,
        comments: metrics.comments,
        subs_gained: metrics.subsGained,
        estimated_minutes_watched: metrics.estimatedMinutesWatched,
        source: mode,
        snapshot_at: new Date().toISOString(),
        ingested_at: new Date().toISOString(),
      };

      // Idempotent upsert on (video_id, period_date): update in place if the
      // day's snapshot already exists, else insert. (Index-agnostic — does not
      // rely on ON CONFLICT inference against the partial unique index.)
      const { data: existing } = await supabase
        .from("analytics")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("video_id", video.id)
        .eq("period_date", periodDate)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase.from("analytics").update(record).eq("id", existing.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("analytics").insert(record);
        if (error) throw new Error(error.message);
      }
      ingested++;
    } catch {
      failed++;
    }
  }

  await logAudit({
    action: "analytics.ingest",
    target: `tenant:${tenantId}`,
    meta: { provider, mode, periodDate, videos: rows.length, ingested, failed },
    tenantId,
  });

  return { ingested, failed, videos: rows.length, mode, periodDate };
}
