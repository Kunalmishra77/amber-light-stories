import "server-only";
import { withTimeout } from "@/lib/ai-gateway/policy";
import { claim, complete, deadLetter, fail, reap, release } from "@/lib/jobs/engine";
import { getHandler } from "@/lib/jobs/registry";
import { onStepJobSettled } from "@/lib/workflow/engine";
import { NonRetryableJobError, type JobRow, type ProcessSummary } from "@/lib/jobs/types";

/**
 * Stateless job runner (M11-1, hardened through Phase D). Safe to invoke
 * repeatedly and concurrently: claiming is atomic (FOR UPDATE SKIP LOCKED with
 * per-tenant fairness caps), so overlapping invocations never double-process a
 * job. One drain cycle: reap expired leases, claim a fair batch, run each
 * handler under an in-process timeout, settle (succeed / retry / DLQ), and
 * notify the workflow layer when the job belongs to a DAG step.
 *
 * Execution semantics — stated precisely:
 *  - ENQUEUE is exactly-once per (tenant, idempotency_key) (DB unique index).
 *  - EXECUTION is AT-LEAST-ONCE: a worker can crash after doing its work but
 *    before recording completion, and the lease reaper will re-run the job.
 *  - SIDE EFFECTS are therefore made IDEMPOTENT by each handler (publication
 *    key, analytics per-video-day upsert, workflow step keys), which is what
 *    makes at-least-once execution safe.
 */
async function notifyWorkflow(
  job: JobRow,
  outcome: "succeeded" | "retrying" | "dead",
  detail: { output?: Record<string, unknown>; error?: string }
): Promise<void> {
  if (!job.workflow_step_id) return;
  try {
    await onStepJobSettled(
      {
        id: job.id,
        tenant_id: job.tenant_id,
        workflow_run_id: job.workflow_run_id,
        workflow_step_id: job.workflow_step_id,
        attempts: job.attempts,
      },
      outcome,
      detail
    );
  } catch {
    // Coordination must never corrupt the job's own settled state; a missed
    // advance is recovered by the next advance/reap cycle.
  }
}

export async function processJobs(opts?: {
  worker?: string;
  batch?: number;
  /**
   * Wall-clock budget for the whole pass. The runner stops STARTING new jobs
   * once it is spent, so the invocation ends on its own terms instead of being
   * killed by the platform mid-job.
   *
   * A killed pass is not corrupting — leases expire and `reap_stale_jobs()`
   * returns the work — but it wastes a full lease interval per interrupted job
   * and makes the queue look stuck. Default leaves headroom under the route's
   * 300s maxDuration.
   */
  budgetMs?: number;
}): Promise<ProcessSummary> {
  const worker = opts?.worker ?? "cron";
  const batch = opts?.batch ?? 10;
  const budgetMs = opts?.budgetMs ?? 240_000;
  const deadline = Date.now() + budgetMs;

  const summary: ProcessSummary = { worker, reaped: 0, claimed: 0, succeeded: 0, failed: 0, dead: 0, deferred: 0 };

  summary.reaped = await reap();

  const jobs = await claim(worker, batch);
  summary.claimed = jobs.length;

  for (const job of jobs) {
    // Out of budget: release the remaining claims immediately rather than
    // holding leases we cannot honour, so the next pass picks them up at once.
    if (Date.now() >= deadline) {
      await release(job.id);
      summary.deferred++;
      continue;
    }
    const handler = getHandler(job.type);
    if (!handler) {
      const reason = `No handler registered for job type "${job.type}".`;
      await deadLetter(job.id, reason);
      await notifyWorkflow(job, "dead", { error: reason });
      summary.dead++;
      continue;
    }

    try {
      const result = await withTimeout(Promise.resolve(handler(job)), job.timeout_ms);
      await complete(job.id, result?.checkpoint);
      await notifyWorkflow(job, "succeeded", { output: result?.checkpoint ?? {} });
      summary.succeeded++;
    } catch (err) {
      const message = err instanceof Error ? err.message : "job failed";
      // Terminal conditions (bad config, closed gate, exhausted budget, open
      // circuit) can never succeed on retry — dead-letter immediately rather
      // than burning the retry budget (retry-storm prevention).
      if (err instanceof NonRetryableJobError) {
        await deadLetter(job.id, message);
        await notifyWorkflow(job, "dead", { error: message });
        summary.failed++;
        summary.dead++;
        continue;
      }
      const outcome = await fail(job, message);
      await notifyWorkflow(job, outcome === "dead" ? "dead" : "retrying", { error: message });
      summary.failed++;
      if (outcome === "dead") summary.dead++;
    }
  }

  return summary;
}
