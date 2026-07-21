import { LineChart, Eye, Clock3, MousePointerClick, Users, FlaskConical } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId, isOwnerOrManager } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import { rollup, type AnalyticsSnapshotRow } from "@/lib/analytics/rollup";
import { RefreshAnalyticsButton } from "./refresh-button";

// Tenant-scoped analytics — live rows on every request.
export const dynamic = "force-dynamic";

interface Row extends AnalyticsSnapshotRow {
  avg_view_pct: number | null;
}

export default async function AnalyticsPage() {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) {
    return (
      <div>
        <PageHeader title="YouTube Analytics" description="Performance insights for published videos." />
        <EmptyState icon={LineChart} title="Join a workspace to see analytics" />
      </div>
    );
  }

  const canEdit = await isOwnerOrManager(tenantId);
  const supabase = await createClient();

  const [analyticsRes, videosRes] = await Promise.all([
    supabase
      .from("analytics")
      .select("video_id, period_date, views, watch_hours, ctr, avg_view_pct, subs_gained, source")
      .eq("tenant_id", tenantId)
      .order("period_date", { ascending: false })
      .limit(500),
    supabase.from("videos").select("id, topic").eq("tenant_id", tenantId),
  ]);

  const rows = (analyticsRes.data ?? []) as Row[];
  const topics = new Map(
    ((videosRes.data ?? []) as { id: string; topic: string | null }[]).map((v) => [v.id, v.topic])
  );

  const totals = rollup(rows);
  const hasData = rows.length > 0;

  // Latest snapshot per video for the table.
  const latest = new Map<string, Row>();
  for (const r of rows) {
    if (!r.video_id) continue;
    const cur = latest.get(r.video_id);
    if (!cur || (r.period_date ?? "") > (cur.period_date ?? "")) latest.set(r.video_id, r);
  }
  const perVideo = Array.from(latest.values());

  return (
    <div>
      <div className="mb-8 flex items-start justify-between gap-4">
        <PageHeader title="YouTube Analytics" description="Performance insights for published videos." />
        {canEdit ? <RefreshAnalyticsButton disabled={false} /> : null}
      </div>

      {totals.allDry ? (
        <div className="mb-6 inline-flex items-center gap-2 rounded-lg border border-[var(--status-paused)]/30 bg-[var(--status-paused)]/10 px-3 py-1.5 text-xs font-medium text-[var(--status-paused)]">
          <FlaskConical className="h-3.5 w-3.5" strokeWidth={2} />
          Sample data — not real YouTube analytics. Connect a live YouTube credential to ingest real metrics.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Views" value={hasData ? totals.totalViews.toLocaleString("en-US") : "—"} icon={Eye} error={!hasData} />
        <StatCard
          label="Watch hours"
          value={hasData ? totals.totalWatchHours.toLocaleString("en-US") : "—"}
          icon={Clock3}
          error={!hasData}
        />
        <StatCard
          label="Avg CTR"
          value={hasData ? `${(totals.avgCtr * 100).toFixed(1)}%` : "—"}
          icon={MousePointerClick}
          error={!hasData}
        />
        <StatCard
          label="Subscribers gained"
          value={hasData ? totals.totalSubsGained.toLocaleString("en-US") : "—"}
          icon={Users}
          error={!hasData}
        />
      </div>

      <div className="mt-8">
        {!hasData ? (
          <EmptyState
            icon={LineChart}
            title="No analytics yet"
            description="Publish videos, then refresh to ingest per-video views, CTR, watch time, and subscriber growth."
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-elevated shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                    <th className="px-4 py-3">Video</th>
                    <th className="px-4 py-3 text-right">Views</th>
                    <th className="px-4 py-3 text-right">CTR</th>
                    <th className="px-4 py-3 text-right">Watch hrs</th>
                    <th className="px-4 py-3 text-right">Avg view %</th>
                    <th className="px-4 py-3 text-right">Subs</th>
                    <th className="px-4 py-3">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {perVideo.map((r) => (
                    <tr key={r.video_id} className="border-b border-border/60 last:border-0">
                      <td className="max-w-[240px] truncate px-4 py-3 text-foreground">
                        {(r.video_id && topics.get(r.video_id)) || "Untitled"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {(r.views ?? 0).toLocaleString("en-US")}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {((r.ctr ?? 0) * 100).toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {(r.watch_hours ?? 0).toLocaleString("en-US")}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {(r.avg_view_pct ?? 0)}%
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {(r.subs_gained ?? 0).toLocaleString("en-US")}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            r.source === "dry"
                              ? "text-xs font-medium text-[var(--status-paused)]"
                              : "text-xs font-medium text-[var(--status-approved)]"
                          }
                        >
                          {r.source === "dry" ? "Sample" : "Live"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
