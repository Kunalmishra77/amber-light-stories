import "server-only";
import { createClient } from "@/lib/supabase/server";
import { PROVIDER_KEYS, isPublishingProvider, type ProviderKey } from "@/lib/providers/registry";

/**
 * Publishing providers (destinations) come from the registry (ADR-003/015):
 * any provider flagged `publishing: true` is a destination. New platforms
 * (Instagram, TikTok, LinkedIn, …) are ONE registry entry + an M4 adapter —
 * this resolution layer never changes. Today only YouTube is flagged.
 */
export type PublishingProvider = ProviderKey;
export const PUBLISHING_PROVIDERS: ProviderKey[] = PROVIDER_KEYS.filter(isPublishingProvider);

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
