import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { publishRun, PublishTargetMissingError, LivePublishDisabledError } from "@/lib/publishing/publish";
import { NonRetryableJobError } from "@/lib/jobs/types";
import type { JobHandler } from "@/lib/jobs/types";

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

  try {
    const result = await publishRun({
      tenantId: job.tenant_id, // authoritative — never payload
      runId,
      storyId,
      mode: "dry", // live (outward) publishing stays owner-gated
      client: createAdminClient(),
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
    // No channel connected / live gate closed are OPERATOR conditions, not
    // transient faults — retrying cannot fix them, so fail fast to the DLQ.
    if (err instanceof PublishTargetMissingError || err instanceof LivePublishDisabledError) {
      throw new NonRetryableJobError(err.message);
    }
    throw err; // transient failures -> Job Engine retry/backoff/DLQ
  }
};

/** Deterministic idempotency key: one publish job per pipeline run. */
export function publishJobKey(runId: string): string {
  return `publish:run:${runId}`;
}
