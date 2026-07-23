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
 *            render or a live upload. Always labelled as a dry run.
 *   - "live": a REAL YouTube upload through the tenant's own OAuth credential
 *            (Priority 1). It refuses rather than inventing anything when the
 *            channel isn't connected or no rendered video exists.
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
    description: string;
    runId: string;
    storyId: string | null;
    client: SupabaseClient;
  }): Promise<{ externalVideoId: string; privacyStatus?: string }>;
}

function dryPublishAdapter(runId: string): PublishAdapter {
  return {
    async publish() {
      // Deterministic simulated video id — no external call, $0.
      return { externalVideoId: `dry_${runId.slice(0, 8)}` };
    },
  };
}

/**
 * Real upload. Uploads as `private` by default: the customer decides when the
 * video goes public on YouTube, and an accidental public post is not something
 * an automated pipeline should be able to do on its own.
 */
function livePublishAdapter(): PublishAdapter {
  return {
    async publish(args) {
      if (args.provider !== "youtube") {
        throw new LivePublishDisabledError();
      }
      const { uploadToYouTube } = await import("@/lib/publishing/youtube-upload");
      const result = await uploadToYouTube({
        tenantId: args.tenantId,
        runId: args.runId,
        storyId: args.storyId,
        title: args.topic,
        description: args.description,
        privacyStatus: "private",
        client: args.client,
      });
      return { externalVideoId: result.externalVideoId, privacyStatus: result.privacyStatus };
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
  // Pass OUR client: in the durable worker there is no session, so the
  // authed default would see nothing under RLS.
  const target = await getPublishingTarget(tenantId, provider, supabase);
  if (!target) throw new PublishTargetMissingError();

  // 2) Idempotency — return the existing publication if this run was published.
  const idempotencyKey = publishIdempotencyKey(runId);
  const { data: existing } = await supabase
    .from("videos")
    .select("id, yt_video_id, status")
    .eq("tenant_id", tenantId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existing && existing.status === "published") {
    return {
      videoId: existing.id as string,
      externalVideoId: (existing.yt_video_id as string) ?? "",
      provider,
      mode,
      alreadyPublished: true,
    };
  }

  // A row that exists but isn't `published` is an INTERRUPTED live attempt: the
  // run was claimed, then the process died. The upload may or may not have
  // reached YouTube, so before retrying we ask the channel whether this run
  // already produced a video — otherwise a retry would publish it twice.
  let claimedVideoId: string | null = existing?.id ?? null;
  if (existing && mode === "live") {
    const { findExistingUpload } = await import("@/lib/publishing/youtube-upload");
    const recovered = await findExistingUpload({ tenantId, runId });
    if (recovered) {
      await supabase
        .from("videos")
        .update({ status: "published", yt_video_id: recovered, published_at: new Date().toISOString() })
        .eq("id", existing.id);
      return {
        videoId: existing.id as string,
        externalVideoId: recovered,
        provider,
        mode,
        alreadyPublished: true,
      };
    }
  }

  // 3) Story context for the publication record.
  let topic = "Untitled";
  let description = "";
  if (input.storyId) {
    const { data: story } = await supabase
      .from("stories")
      .select("topic, logline, moral")
      .eq("id", input.storyId)
      .maybeSingle();
    topic = (story?.topic as string) || topic;
    description = [story?.logline, story?.moral].filter(Boolean).join("\n\n");
  }

  // 4) A live upload needs the tenant's own authorization. Fail fast with a
  //    clear reconnect prompt rather than part-way through the upload.
  if (mode === "live") {
    const credential = await getTenantCredential(tenantId, provider);
    if (!credential) {
      throw new PublishTargetMissingError();
    }
  }

  // 5) CLAIM the run before any external call. The unique idempotency key makes
  //    this an atomic claim, so two concurrent workers cannot both upload.
  if (mode === "live" && !claimedVideoId) {
    const { data: claim, error: claimError } = await supabase
      .from("videos")
      .insert({
        tenant_id: tenantId,
        channel_id: target.id,
        story_id: input.storyId,
        topic,
        status: "publishing",
        idempotency_key: idempotencyKey,
      })
      .select("id")
      .single();
    if (claimError || !claim) {
      // 23505 = a concurrent worker claimed it first; let that one finish.
      if ((claimError as { code?: string } | null)?.code === "23505") {
        const { data: winner } = await supabase
          .from("videos")
          .select("id, yt_video_id")
          .eq("tenant_id", tenantId)
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();
        return {
          videoId: (winner?.id as string) ?? "",
          externalVideoId: (winner?.yt_video_id as string) ?? "",
          provider,
          mode,
          alreadyPublished: true,
        };
      }
      throw new Error(claimError?.message ?? "Couldn't claim the publication.");
    }
    claimedVideoId = claim.id as string;
  }

  // 6) Execute through the adapter (dry = simulated, live = a real upload).
  const adapter = resolvePublishAdapter(mode, runId);
  let externalVideoId: string;
  let privacyStatus: string | undefined;
  try {
    const result = await adapter.publish({
      tenantId,
      provider,
      externalChannelId: target.externalChannelId,
      topic,
      description,
      runId,
      storyId: input.storyId,
      client: supabase,
    });
    externalVideoId = result.externalVideoId;
    privacyStatus = result.privacyStatus;
  } catch (err) {
    // Keep the claim so a retry reconciles against YouTube instead of
    // uploading blind, and record why it failed for the operator.
    if (claimedVideoId) {
      await supabase
        .from("videos")
        .update({ status: "failed" })
        .eq("id", claimedVideoId);
    }
    throw err;
  }

  // 7) Record the publication — completing the claim for live, inserting for dry.
  const now = new Date().toISOString();
  let videoId: string;
  if (claimedVideoId) {
    const { error } = await supabase
      .from("videos")
      .update({ status: "published", published_at: now, yt_video_id: externalVideoId })
      .eq("id", claimedVideoId);
    if (error) throw new Error(error.message);
    videoId = claimedVideoId;
  } else {
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
    videoId = video.id as string;
  }

  await logAudit({
    action: "publish.run",
    target: `video:${videoId}`,
    meta: { run_id: runId, provider, mode, external_video_id: externalVideoId, privacy_status: privacyStatus ?? null },
    tenantId,
  });
  await notify({
    tenantId,
    kind: "video_published",
    category: "publishing",
    title: mode === "live" ? "Video uploaded to YouTube" : "Video published (dry run)",
    body:
      mode === "live"
        ? `"${topic}" was uploaded to ${target.title ?? "your channel"} as ${privacyStatus ?? "private"}. Make it public on YouTube when you're ready.`
        : `"${topic}" completed a DRY run against ${target.title ?? "your channel"} — nothing was uploaded.`,
    link: "/publishing",
    entityType: "video",
    entityId: videoId,
    dedupeKey: `published:${videoId}`,
  });
  await dispatchEvent({
    tenantId,
    eventType: "video.published",
    data: {
      video_id: videoId,
      run_id: runId,
      story_id: input.storyId,
      provider,
      mode,
      external_video_id: externalVideoId,
      privacy_status: privacyStatus ?? null,
    },
  });

  return { videoId, externalVideoId, provider, mode, alreadyPublished: false };
}
