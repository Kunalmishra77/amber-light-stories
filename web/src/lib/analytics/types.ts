import type { ProviderKey } from "@/lib/providers/registry";

/**
 * Analytics ingestion domain (M10 / ISS-P3-05, v1.0 loop step 7). Provider-
 * abstracted so future platforms (TikTok/Instagram/…) add ONE adapter without
 * touching the ingestion/rollup/UI. YouTube is the first analytics provider.
 *
 * Mode is explicit provenance, never blurred:
 *   - "live": real external Analytics API data.
 *   - "dry":  deterministic test fixtures (labeled as such in storage + UI;
 *             NEVER presented as real).
 */
export type AnalyticsMode = "dry" | "live";
export type AnalyticsProvider = ProviderKey;

/** Normalized per-video metrics for one period (a single day). */
export interface VideoMetrics {
  views: number;
  impressions: number;
  /** Click-through rate, 0..1. */
  ctr: number;
  watchHours: number;
  /** Average percentage of the video watched, 0..100. */
  avgViewPct: number;
  likes: number;
  comments: number;
  subsGained: number;
  estimatedMinutesWatched: number;
}

/** Provider-independent analytics adapter contract. */
export interface AnalyticsAdapter {
  provider: AnalyticsProvider;
  mode: AnalyticsMode;
  /** Fetch one external video's metrics for `periodDate` (YYYY-MM-DD). */
  fetchVideoMetrics(args: {
    externalVideoId: string;
    credential: string | null;
    periodDate: string;
  }): Promise<VideoMetrics>;
}

/** Live analytics unavailable (no credential / provider not enabled). The
 * gated live extension point throws this; ingestion falls back to recording a
 * failure for that video rather than fabricating data. */
export class AnalyticsUnavailableError extends Error {
  constructor(message = "Live analytics is unavailable — no valid credential for this provider.") {
    super(message);
    this.name = "AnalyticsUnavailableError";
  }
}
