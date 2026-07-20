import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Publishing providers (destinations). Provider-abstracted so new platforms
 * (Instagram, TikTok, …) are added as new values + adapters, with no change
 * to the resolution layer (Bible Part 3 ADR-015, Part 6 §16.1). Today only
 * YouTube is wired; the union is the extension point.
 */
export const PUBLISHING_PROVIDERS = ["youtube"] as const;
export type PublishingProvider = (typeof PUBLISHING_PROVIDERS)[number];

/**
 * A tenant's publishing destination — a typed, provider-agnostic view over a
 * `channels` row. Generation/publishing (M4) targets THIS per-tenant channel,
 * never a global `.env` channel (ISS-B1 / ISS-E1).
 */
export interface PublishingTarget {
  id: string;
  provider: string;
  externalChannelId: string | null;
  title: string | null;
  status: string | null;
  createdAt: string | null;
}

interface ChannelRow {
  id: string;
  provider: string | null;
  external_channel_id: string | null;
  yt_channel_id: string | null;
  title: string | null;
  name: string | null;
  status: string | null;
  created_at: string;
}

function toTarget(row: ChannelRow): PublishingTarget {
  return {
    id: row.id,
    provider: row.provider ?? "youtube",
    externalChannelId: row.external_channel_id ?? row.yt_channel_id ?? null,
    title: row.title ?? row.name ?? null,
    status: row.status ?? null,
    createdAt: row.created_at ?? null,
  };
}

/**
 * All publishing targets for a tenant + provider (a tenant may connect more
 * than one channel per platform in future). Reads the tenant-scoped
 * `channels` table under RLS via the authed client — the caller's session
 * already constrains it to their own tenant. Newest first.
 */
export async function listPublishingTargets(
  tenantId: string,
  provider: PublishingProvider = "youtube"
): Promise<PublishingTarget[]> {
  if (!tenantId) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("channels")
    .select("id, provider, external_channel_id, yt_channel_id, title, name, status, created_at")
    .eq("tenant_id", tenantId)
    .eq("provider", provider)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return (data as ChannelRow[]).map(toTarget);
}

/**
 * The tenant's primary publishing target for a provider (the most recently
 * connected channel), or null if none is connected. This is what a publish
 * job resolves to when M4 wires the loop.
 */
export async function getPublishingTarget(
  tenantId: string,
  provider: PublishingProvider = "youtube"
): Promise<PublishingTarget | null> {
  const targets = await listPublishingTargets(tenantId, provider);
  return targets[0] ?? null;
}
