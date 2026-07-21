import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Tenant-isolated structured Content Memory (M12 G4 — ADR-043). Records what a
 * workspace has already made so planning can DEDUPE, REUSE and STEER.
 *
 * Deliberately structured-only: semantic/vector memory depends on paid
 * embeddings and is deferred with R1-03 (no pgvector installed).
 *
 * `performance` is written ONLY from analytics rows whose `source='live'`.
 * Dry/sample analytics are never promoted into memory — memory must not
 * present fabricated numbers as learned intelligence.
 */
export type MemoryKind = "topic" | "entity" | "hook" | "seo_term" | "character_usage";

export interface MemoryEntry {
  id: string;
  tenant_id: string;
  kind: string;
  key: string;
  label: string | null;
  usage_count: number;
  first_used_at: string | null;
  last_used_at: string | null;
  story_ids: string[];
  performance: Record<string, unknown>;
}

/** Normalize free text into a stable memory key (dedupe unit). */
export function memoryKey(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    .sort()
    .join("-")
    .slice(0, 120);
}

const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "how", "why", "what",
  "your", "you", "are", "was", "were", "will", "can", "has", "had", "its", "his", "her",
]);

/** Jaccard overlap of two normalized memory keys (0..1) — cheap dedupe signal. */
export function keySimilarity(a: string, b: string): number {
  const A = new Set(a.split("-").filter(Boolean));
  const B = new Set(b.split("-").filter(Boolean));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Record that a tenant used a topic/term, linked to the story that used it. */
export async function rememberUsage(
  input: { tenantId: string; kind: MemoryKind; text: string; storyId?: string | null; meta?: Record<string, unknown> },
  client?: SupabaseClient
): Promise<void> {
  const key = memoryKey(input.text);
  if (!key) return;
  const admin = client ?? createAdminClient();
  const now = new Date().toISOString();

  const { data: existing } = await admin
    .from("content_memory")
    .select("id, usage_count, story_ids")
    .eq("tenant_id", input.tenantId)
    .eq("kind", input.kind)
    .eq("key", key)
    .maybeSingle();

  if (existing) {
    const storyIds = new Set(((existing.story_ids as string[]) ?? []).filter(Boolean));
    if (input.storyId) storyIds.add(input.storyId);
    await admin
      .from("content_memory")
      .update({
        usage_count: ((existing.usage_count as number) ?? 0) + 1,
        last_used_at: now,
        story_ids: Array.from(storyIds),
        updated_at: now,
      })
      .eq("id", existing.id);
    return;
  }

  await admin.from("content_memory").insert({
    tenant_id: input.tenantId,
    kind: input.kind,
    key,
    label: input.text.slice(0, 200),
    usage_count: 1,
    first_used_at: now,
    last_used_at: now,
    story_ids: input.storyId ? [input.storyId] : [],
    meta: input.meta ?? {},
  });
}

export interface DuplicateMatch {
  entry: MemoryEntry;
  similarity: number;
}

/**
 * Find prior topics similar to a candidate — the dedupe/steer signal consumed
 * by planning. Strictly tenant-scoped; a tenant's memory never informs another.
 */
export async function findSimilarTopics(
  tenantId: string,
  candidate: string,
  opts?: { threshold?: number; limit?: number },
  client?: SupabaseClient
): Promise<DuplicateMatch[]> {
  const key = memoryKey(candidate);
  if (!key) return [];
  const admin = client ?? createAdminClient();
  const threshold = opts?.threshold ?? 0.5;

  const { data } = await admin
    .from("content_memory")
    .select("id, tenant_id, kind, key, label, usage_count, first_used_at, last_used_at, story_ids, performance")
    .eq("tenant_id", tenantId)
    .eq("kind", "topic")
    .order("last_used_at", { ascending: false })
    .limit(500);

  return ((data ?? []) as MemoryEntry[])
    .map((entry) => ({ entry, similarity: keySimilarity(key, entry.key) }))
    .filter((m) => m.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, opts?.limit ?? 5);
}

/**
 * Attach REAL performance to memory. Only analytics rows with source='live'
 * are considered — sample/dry analytics are ignored so memory never learns
 * from fabricated numbers. Returns how many entries were updated.
 */
export async function linkLivePerformance(
  tenantId: string,
  client?: SupabaseClient
): Promise<{ updated: number; skippedNonLive: number }> {
  const admin = client ?? createAdminClient();

  const { data: rows } = await admin
    .from("analytics")
    .select("video_id, views, ctr, watch_hours, subs_gained, source, period_date")
    .eq("tenant_id", tenantId)
    .order("period_date", { ascending: false })
    .limit(500);

  const all = (rows ?? []) as Array<{ video_id: string | null; views: number | null; ctr: number | null; watch_hours: number | null; subs_gained: number | null; source: string | null }>;
  const live = all.filter((r) => r.source === "live");
  const skippedNonLive = all.length - live.length;
  if (live.length === 0) return { updated: 0, skippedNonLive };

  // Map video -> story -> topic memory entry.
  const videoIds = Array.from(new Set(live.map((r) => r.video_id).filter((v): v is string => Boolean(v))));
  if (videoIds.length === 0) return { updated: 0, skippedNonLive };
  const { data: videos } = await admin
    .from("videos")
    .select("id, story_id, topic")
    .eq("tenant_id", tenantId)
    .in("id", videoIds);

  let updated = 0;
  for (const v of (videos ?? []) as { id: string; story_id: string | null; topic: string | null }[]) {
    if (!v.topic) continue;
    const key = memoryKey(v.topic);
    if (!key) continue;
    const metrics = live.filter((r) => r.video_id === v.id);
    const agg = metrics.reduce(
      (acc, m) => ({
        views: acc.views + (m.views ?? 0),
        watch_hours: acc.watch_hours + (m.watch_hours ?? 0),
        subs_gained: acc.subs_gained + (m.subs_gained ?? 0),
        ctr_sum: acc.ctr_sum + (m.ctr ?? 0),
        n: acc.n + 1,
      }),
      { views: 0, watch_hours: 0, subs_gained: 0, ctr_sum: 0, n: 0 }
    );
    const { error } = await admin
      .from("content_memory")
      .update({
        performance: {
          source: "live",
          views: agg.views,
          watch_hours: Number(agg.watch_hours.toFixed(2)),
          subs_gained: agg.subs_gained,
          avg_ctr: agg.n ? Number((agg.ctr_sum / agg.n).toFixed(4)) : null,
          samples: agg.n,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId)
      .eq("kind", "topic")
      .eq("key", key);
    if (!error) updated++;
  }
  return { updated, skippedNonLive };
}
