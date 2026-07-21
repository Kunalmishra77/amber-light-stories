import "server-only";
import {
  type AnalyticsAdapter,
  type AnalyticsMode,
  type VideoMetrics,
  AnalyticsUnavailableError,
} from "@/lib/analytics/types";

/**
 * YouTube analytics adapter (M10 / ISS-P3-05). Two modes, provenance never
 * blurred:
 *   - dry:  DETERMINISTIC fixtures derived from (videoId, periodDate) — stable
 *           across re-runs, clearly `source='dry'`, never real.
 *   - live: a REAL YouTube Analytics API call (v2 reports) using the tenant's
 *           OAuth credential. If no credential is present it throws
 *           AnalyticsUnavailableError — it never invents data.
 */

/** Small deterministic hash → non-negative int, for stable dry fixtures. */
function seed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Deterministic, plausible metrics for a video+day (dry mode only). */
export function dryMetrics(externalVideoId: string, periodDate: string): VideoMetrics {
  const s = seed(`${externalVideoId}|${periodDate}`);
  const views = 250 + (s % 4750); // 250..4999
  const impressions = views * (6 + (s % 6)); // CTR ~ 1/6..1/12
  const ctr = impressions > 0 ? views / impressions : 0;
  const avgViewPct = 35 + (s % 45); // 35..79%
  const durationMin = 0.7 + ((s >> 3) % 3) * 0.1; // ~0.7..0.9 min shorts
  const watchHours = (views * durationMin * (avgViewPct / 100)) / 60;
  return {
    views,
    impressions,
    ctr: Number(ctr.toFixed(4)),
    watchHours: Number(watchHours.toFixed(2)),
    avgViewPct,
    likes: Math.floor(views * (0.03 + ((s >> 5) % 5) / 100)),
    comments: Math.floor(views * 0.004),
    subsGained: Math.floor(views * 0.01),
    estimatedMinutesWatched: Math.floor(views * durationMin * (avgViewPct / 100)),
  };
}

function dryAdapter(): AnalyticsAdapter {
  return {
    provider: "youtube",
    mode: "dry",
    async fetchVideoMetrics({ externalVideoId, periodDate }) {
      return dryMetrics(externalVideoId, periodDate);
    },
  };
}

function liveAdapter(): AnalyticsAdapter {
  return {
    provider: "youtube",
    mode: "live",
    async fetchVideoMetrics({ externalVideoId, credential, periodDate }) {
      if (!credential) throw new AnalyticsUnavailableError();

      // Real YouTube Analytics API (v2 reports). The credential is the tenant's
      // OAuth access token (resolved via the Vault seam). One day window.
      const params = new URLSearchParams({
        ids: "channel==MINE",
        startDate: periodDate,
        endDate: periodDate,
        metrics: "views,estimatedMinutesWatched,averageViewPercentage,likes,comments,subscribersGained",
        filters: `video==${externalVideoId}`,
      });
      const res = await fetch(`https://youtubeanalytics.googleapis.com/v2/reports?${params.toString()}`, {
        headers: { Authorization: `Bearer ${credential}` },
      });
      if (!res.ok) {
        throw new AnalyticsUnavailableError(`YouTube Analytics API returned ${res.status}.`);
      }
      const body = (await res.json()) as { rows?: number[][] };
      const row = body.rows?.[0] ?? [];
      const [views = 0, minutes = 0, avgPct = 0, likes = 0, comments = 0, subs = 0] = row;
      return {
        views,
        impressions: 0, // impressions require a separate reporting query
        ctr: 0,
        watchHours: Number((minutes / 60).toFixed(2)),
        avgViewPct: avgPct,
        likes,
        comments,
        subsGained: subs,
        estimatedMinutesWatched: minutes,
      };
    },
  };
}

export function youtubeAnalyticsAdapter(mode: AnalyticsMode): AnalyticsAdapter {
  return mode === "live" ? liveAdapter() : dryAdapter();
}
