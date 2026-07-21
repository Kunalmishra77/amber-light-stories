import "server-only";
import { withTimeout } from "@/lib/ai-gateway/policy";
import { claim, complete, deadLetter, fail, reap } from "@/lib/jobs/engine";
import { getHandler } from "@/lib/jobs/registry";
import type { ProcessSummary } from "@/lib/jobs/types";

/**
 * Stateless job runner (M11-1). Safe to invoke repeatedly and concurrently:
 * claiming is atomic (FOR UPDATE SKIP LOCKED), so overlapping invocations never
 * double-process a job. One drain cycle: reap expired leases, claim a batch,
 * run each handler under an in-process timeout, then settle (succeed / retry /
 * DLQ). Reuses the AI Gateway's withTimeout primitive.
 */
export async function processJobs(opts?: { worker?: string; batch?: number }): Promise<ProcessSummary> {
  const worker = opts?.worker ?? "cron";
  const batch = opts?.batch ?? 10;

  const summary: ProcessSummary = { worker, reaped: 0, claimed: 0, succeeded: 0, failed: 0, dead: 0 };

  summary.reaped = await reap();

  const jobs = await claim(worker, batch);
  summary.claimed = jobs.length;

  for (const job of jobs) {
    const handler = getHandler(job.type);
    if (!handler) {
      await deadLetter(job.id, `No handler registered for job type "${job.type}".`);
      summary.dead++;
      continue;
    }

    try {
      const result = await withTimeout(Promise.resolve(handler(job)), job.timeout_ms);
      await complete(job.id, result?.checkpoint);
      summary.succeeded++;
    } catch (err) {
      const outcome = await fail(job, err instanceof Error ? err.message : "job failed");
      summary.failed++;
      if (outcome === "dead") summary.dead++;
    }
  }

  return summary;
}
