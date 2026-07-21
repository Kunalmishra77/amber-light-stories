import "server-only";
import type { AnalyticsAdapter, AnalyticsMode, AnalyticsProvider } from "@/lib/analytics/types";
import { youtubeAnalyticsAdapter } from "@/lib/analytics/adapters/youtube";

/**
 * Analytics adapter registry (M10 / ISS-P3-05). Provider → adapter factory.
 * Adding a future platform is ONE entry here + one adapter file — the ingestion
 * path, rollups, storage, and dashboard never change.
 */
const ADAPTERS: Partial<Record<AnalyticsProvider, (mode: AnalyticsMode) => AnalyticsAdapter>> = {
  youtube: youtubeAnalyticsAdapter,
};

export function resolveAnalyticsAdapter(
  provider: AnalyticsProvider,
  mode: AnalyticsMode
): AnalyticsAdapter | null {
  const factory = ADAPTERS[provider];
  return factory ? factory(mode) : null;
}

/** Providers that currently have an analytics adapter. */
export function analyticsProviders(): AnalyticsProvider[] {
  return Object.keys(ADAPTERS) as AnalyticsProvider[];
}
