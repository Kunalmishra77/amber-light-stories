import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/ops/audit";
import { notify } from "@/lib/ops/notify";
import { dispatchEvent } from "@/lib/webhooks/dispatch";
import { getPublishingTarget, type PublishingProvider } from "@/lib/providers/publishing";
import { getTenantCredential } from "@/lib/providers/tenant-providers";

/**
 * Publish execution — closes step 6 of the customer loop (M10 / ISS-P3-12 /
 * ISS-B1). Resolves the tenant's OWN publishing channel via the M3 resolver
 * (never a global .env channel), then routes through a provider-independent
 * publish adapter and records a `videos` publication row.
 *
 * Modes mirror generation:
 *   - "dry"  (default): $0, no external call — records a simulated publication
 *            so the whole loop is exercisable + reviewable without a paid
 *            render or a live upload.
 *   - "live": the gated extension point — a real YouTube upload via the
 *            tenant's OAuth credential. Deliberately CLOSED (throws) until a
 *            rendered asset exists AND the owner authorizes outward publishing.
 *
 * Idempotent: one publication per run (`videos.idempotency_key = publish:<run>`),
 * so a re-approval or retry never double-publishes.
 */
export type PublishMode = "dry" | "live";

/** No YouTube channel connected for the tenant — the customer must connect one. */
export class PublishTargetMissingError extends Error {
  constructor() {
    super("Connect a YouTube channel before publishing.");
    this.name = "PublishTargetMissingError";
  }
}

/** Live (outward) publishing is the gated extension point. */
export class LivePublishDisabledError extends Error {
  constructor() {
    super("Live publishing is not enabled — a rendered video and explicit authorization are required.");
    this.name = "LivePublishDisabledError";
  }
}

export interface PublishRunInput {
  tenantId: string;
  runId: string;
  storyId: string | null;
  mode?: PublishMode;
  /** Client to write with — the scheduler passes the service-role client. */
  client?: SupabaseClient;
}

export interface PublishResult {
  videoId: string;
  externalVideoId: string;
  provider: PublishingProvider;
  mode: PublishMode;
  alreadyPublished: boolean;
}

/** Provider-independent publish adapter. YouTube is the first; new
 * destinations are one registry entry + one adapter, no caller change. */
interface PublishAdapter {
  publish(args: {
    tenantId: string;
    provider: PublishingProvider;
    externalChannelId: string | null;
    topic: string;
    credential: string | null;
  }): Promise<{ externalVideoId: string }>;
}

function dryPublishAdapter(runId: string): PublishAdapter {
  return {
    async publish() {
      // Deterministic simulated video id — no external call, $0.
      return { externalVideoId: `dry_${runId.slice(0, 8)}` };
    },
  };
}

function livePublishAdapter(): PublishAdapter {
  return {
    async publish() {
      // Real YouTube Data API upload plugs in HERE (via the tenant credential
      // + rendered asset). Gated until authorized.
      throw new LivePublishDisabledError();
    },
  };
}

function resolvePublishAdapter(mode: PublishMode, runId: string): PublishAdapter {
  return mode === "live" ? livePublishAdapter() : dryPublishAdapter(runId);
}

/** Deterministic idempotency key: one publication per run. */
export function publishIdempotencyKey(runId: string): string {
  return `publish:${runId}`;
}

export async function publishRun(input: PublishRunInput): Promise<PublishResult> {
  const { tenantId, runId } = input;
  const mode: PublishMode = input.mode ?? "dry";
  const provider: PublishingProvider = "youtube";
  const supabase = input.client ?? (await createClient());

  // 1) Resolve the tenant's OWN channel (M3). No channel = customer action.
  const target = await getPublishingTarget(tenantId, provider);
  if (!target) throw new PublishTargetMissingError();

  // 2) Idempotency — return the existing publication if this run was published.
  const idempotencyKey = publishIdempotencyKey(runId);
  const { data: existing } = await supabase
    .from("videos")
    .select("id, yt_video_id")
    .eq("tenant_id", tenantId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (existing) {
    return {
      videoId: existing.id as string,
      externalVideoId: (existing.yt_video_id as string) ?? "",
      provider,
      mode,
      alreadyPublished: true,
    };
  }

  // 3) Story context for the publication record.
  let topic = "Untitled";
  if (input.storyId) {
    const { data: story } = await supabase
      .from("stories")
      .select("topic")
      .eq("id", input.storyId)
      .maybeSingle();
    topic = (story?.topic as string) || topic;
  }

  // 4) Credential only matters for a live upload (resolved via the Vault seam).
  const credential = mode === "live" ? await getTenantCredential(tenantId, provider) : null;

  // 5) Execute through the adapter (dry = simulated, live = gated).
  const adapter = resolvePublishAdapter(mode, runId);
  const { externalVideoId } = await adapter.publish({
    tenantId,
    provider,
    externalChannelId: target.externalChannelId,
    topic,
    credential,
  });

  // 6) Record the publication.
  const now = new Date().toISOString();
  const { data: video, error } = await supabase
    .from("videos")
    .insert({
      tenant_id: tenantId,
      channel_id: target.id,
      story_id: input.storyId,
      topic,
      status: "published",
      published_at: now,
      yt_video_id: externalVideoId,
      idempotency_key: idempotencyKey,
    })
    .select("id")
    .single();
  if (error || !video) {
    throw new Error(error?.message ?? "Couldn't record the publication.");
  }

  await logAudit({
    action: "publish.run",
    target: `video:${video.id}`,
    meta: { run_id: runId, provider, mode, external_video_id: externalVideoId },
    tenantId,
  });
  await notify({
    tenantId,
    kind: "video_published",
    title: "Video published",
    body: `"${topic}" was published to ${target.title ?? "your channel"} — ${mode}-run.`,
  });
  await dispatchEvent({
    tenantId,
    eventType: "video.published",
    data: { video_id: video.id, run_id: runId, story_id: input.storyId, provider, mode, external_video_id: externalVideoId },
  });

  return {
    videoId: video.id as string,
    externalVideoId,
    provider,
    mode,
    alreadyPublished: false,
  };
}
