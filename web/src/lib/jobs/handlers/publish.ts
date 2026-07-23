import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { publishRun, PublishTargetMissingError, LivePublishDisabledError } from "@/lib/publishing/publish";
import { NonRetryableJobError } from "@/lib/jobs/types";
import type { JobHandler } from "@/lib/jobs/types";
import { evaluateApproval } from "@/lib/approval/decision";
import {
  RenderedVideoMissingError,
  YouTubeAuthError,
  YouTubeUploadError,
} from "@/lib/publishing/errors";

/**
 * Durable publish handler (M11 Phase B). Reuses the M10 publishing abstraction
 * (`publishRun`) — the provider-independent adapter, the M3 channel/credential
 * seams, and its own `videos.idempotency_key` publication guard. No publishing
 * logic is duplicated here.
 *
 * Exactly-once publication is guaranteed by TWO independent layers:
 *   1. the job's deterministic idempotency key (one publish job per run), and
 *   2. `publishRun`'s per-run publication key (a second execution of the same
 *      job returns the existing publication instead of publishing again).
 * So even though job EXECUTION is at-least-once, the publication side effect is
 * idempotent — a run is never published twice.
 */
export const publishRunHandler: JobHandler = async (job) => {
  if (!job.tenant_id) throw new Error("publish job is missing tenant_id");

  const payload = job.payload ?? {};
  const runId = payload.runId as string | undefined;
  const storyId = (payload.storyId as string | null) ?? null;
  if (!runId) throw new NonRetryableJobError("publish job payload is missing runId");

  const client = createAdminClient();

  // M15 O2 — LAST-MILE re-check. Publishing is the outward-facing side effect,
  // and approval happened earlier: an emergency stop, a compliance block or an
  // exhausted budget can land in between. Re-evaluating here is what makes
  // "compliance BLOCKED is never bypassable" true in practice rather than only
  // at the moment a reviewer clicked approve.
  const outcome = await evaluateApproval({
    tenantId: job.tenant_id,
    runId,
    stageId: null,
    stageName: "publish",
    isAutomation: true,
    intent: "advance",
    client,
    correlationId: (job as { correlation_id?: string | null }).correlation_id ?? null,
  });
  if (!outcome.allowed) {
    // A safety refusal is an operator condition, not a transient fault.
    throw new NonRetryableJobError(`Publication halted: ${outcome.reasons.join(" ")}`);
  }

  // Live vs dry is decided by REAL state, never by the payload: a workspace
  // publishes for real only once it has connected its own YouTube channel and
  // the platform has OAuth configured. Everything else stays a dry run, clearly
  // labelled as such.
  const mode = await resolvePublishMode(job.tenant_id);

  try {
    const result = await publishRun({
      tenantId: job.tenant_id, // authoritative — never payload
      runId,
      storyId,
      mode,
      client,
    });
    return {
      checkpoint: {
        videoId: result.videoId,
        externalVideoId: result.externalVideoId,
        provider: result.provider,
        mode: result.mode,
        alreadyPublished: result.alreadyPublished,
      },
    };
  } catch (err) {
    // OPERATOR conditions — no channel, revoked authorization, nothing rendered,
    // or media YouTube rejected outright. Retrying cannot fix any of them, so
    // fail fast to the DLQ where an incident is raised with a playbook.
    if (
      err instanceof PublishTargetMissingError ||
      err instanceof LivePublishDisabledError ||
      err instanceof YouTubeAuthError ||
      err instanceof RenderedVideoMissingError ||
      (err instanceof YouTubeUploadError && !err.retryable)
    ) {
      throw new NonRetryableJobError(err.message);
    }
    throw err; // transient failures (quota, network, 5xx) -> retry/backoff/DLQ
  }
};

/** Deterministic idempotency key: one publish job per pipeline run. */
export function publishJobKey(runId: string): string {
  return `publish:run:${runId}`;
}

/**
 * A workspace publishes for real when BOTH are true:
 *   - the platform has YouTube OAuth configured (an owner action), and
 *   - the workspace has connected its own channel and holds a live credential.
 * Otherwise the run stays dry. This is deliberately derived from state rather
 * than configuration flags, so a half-finished connection can never cause a
 * surprise upload.
 */
export async function resolvePublishMode(tenantId: string): Promise<"dry" | "live"> {
  try {
    const [{ isOAuthConfigured }, { hasTenantCredential }] = await Promise.all([
      import("@/lib/providers/youtube-config"),
      import("@/lib/providers/tenant-providers"),
    ]);
    if (!isOAuthConfigured()) return "dry";

    const admin = createAdminClient();
    const { data: channel } = await admin
      .from("channels")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("provider", "youtube")
      .eq("status", "connected")
      .maybeSingle();
    if (!channel) return "dry";

    return (await hasTenantCredential(tenantId, "youtube")) ? "live" : "dry";
  } catch {
    // Any doubt resolves to dry: never upload by accident.
    return "dry";
  }
}
