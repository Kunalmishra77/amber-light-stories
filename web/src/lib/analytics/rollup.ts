/**
 * Analytics rollup (M10 / ISS-P3-05). Pure, dependency-free — turns per-video
 * daily snapshot rows into the workspace-level totals the dashboard shows.
 * Uses the LATEST snapshot per video (by period_date) so a video counted once,
 * at its most recent numbers. Unit-testable in isolation.
 */
export interface AnalyticsSnapshotRow {
  video_id: string | null;
  period_date: string | null;
  views: number | null;
  watch_hours: number | null;
  ctr: number | null;
  subs_gained: number | null;
  source: string | null;
}

export interface AnalyticsRollup {
  totalViews: number;
  totalWatchHours: number;
  /** Mean CTR across videos, 0..1. */
  avgCtr: number;
  totalSubsGained: number;
  videoCount: number;
  /** True when every contributing row is dry/test data (drives UI labeling). */
  allDry: boolean;
}

/** Keep only the most recent snapshot per video. */
export function latestPerVideo(rows: AnalyticsSnapshotRow[]): AnalyticsSnapshotRow[] {
  const byVideo = new Map<string, AnalyticsSnapshotRow>();
  for (const row of rows) {
    if (!row.video_id) continue;
    const existing = byVideo.get(row.video_id);
    if (!existing || (row.period_date ?? "") > (existing.period_date ?? "")) {
      byVideo.set(row.video_id, row);
    }
  }
  return Array.from(byVideo.values());
}

export function rollup(rows: AnalyticsSnapshotRow[]): AnalyticsRollup {
  const latest = latestPerVideo(rows);
  const videoCount = latest.length;
  const totalViews = latest.reduce((s, r) => s + (r.views ?? 0), 0);
  const totalWatchHours = latest.reduce((s, r) => s + (r.watch_hours ?? 0), 0);
  const totalSubsGained = latest.reduce((s, r) => s + (r.subs_gained ?? 0), 0);
  const ctrValues = latest.map((r) => r.ctr ?? 0);
  const avgCtr = ctrValues.length ? ctrValues.reduce((a, b) => a + b, 0) / ctrValues.length : 0;
  const allDry = videoCount > 0 && latest.every((r) => r.source === "dry");
  return {
    totalViews,
    totalWatchHours: Number(totalWatchHours.toFixed(2)),
    avgCtr,
    totalSubsGained,
    videoCount,
    allDry,
  };
}
