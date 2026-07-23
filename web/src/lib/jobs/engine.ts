import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { isExhausted, nextRunAfter } from "@/lib/jobs/backoff";
import type { EnqueueInput, JobRow } from "@/lib/jobs/types";

/**
 * Durable Job Engine (M11-1 / ISS-P5-02, ADR-030). All state lives in the
 * `jobs` table — this is a real DB-backed queue, not an in-memory one. The
 * service-role client is used because the runner processes cross-tenant jobs;
 * every row carries an explicit `tenant_id` and handlers scope by it.
 */
function admin(client?: SupabaseClient): SupabaseClient {
  return client ?? createAdminClient();
}

const JOB_SELECT =
  "id, tenant_id, run_id, type, status, priority, attempts, max_attempts, idempotency_key, payload, checkpoint, last_error, run_after, locked_by, locked_at, lease_expires_at, timeout_ms, started_at, finished_at, dead_at, created_at, updated_at, workflow_run_id, workflow_step_id";

/**
 * Enqueue a job. Idempotent when `idempotencyKey` is set: a second enqueue for
 * the same (tenant, key) returns the EXISTING job instead of creating a
 * duplicate (exactly-once enqueue) — enforced by the DB unique index and a
 * race-safe fallback on the 23505 unique-violation.
 */
export async function enqueue(input: EnqueueInput, client?: SupabaseClient): Promise<JobRow> {
  const db = admin(client);

  if (input.idempotencyKey) {
    const { data: existing } = await db
      .from("jobs")
      .select(JOB_SELECT)
      .eq("tenant_id", input.tenantId)
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();
    if (existing) return existing as JobRow;
  }

  const row = {
    tenant_id: input.tenantId,
    run_id: input.runId ?? null,
    type: input.type,
    status: "queued",
    priority: input.priority ?? 0,
    idempotency_key: input.idempotencyKey ?? null,
    payload: input.payload ?? {},
    run_after: input.runAfter ?? new Date().toISOString(),
    workflow_run_id: input.workflowRunId ?? null,
    workflow_step_id: input.workflowStepId ?? null,
    ...(input.maxAttempts != null ? { max_attempts: input.maxAttempts } : {}),
    ...(input.timeoutMs != null ? { timeout_ms: input.timeoutMs } : {}),
  };

  const { data, error } = await db.from("jobs").insert(row).select(JOB_SELECT).single();
  if (error) {
    // Race: a concurrent enqueue won the unique index — return the winner.
    if (error.code === "23505" && input.idempotencyKey) {
      const { data: existing } = await db
        .from("jobs")
        .select(JOB_SELECT)
        .eq("tenant_id", input.tenantId)
        .eq("idempotency_key", input.idempotencyKey)
        .maybeSingle();
      if (existing) return existing as JobRow;
    }
    throw new Error(error.message);
  }
  return data as JobRow;
}

/** Reclaim jobs whose worker lease expired (crash recovery). Returns count. */
export async function reap(client?: SupabaseClient): Promise<number> {
  const db = admin(client);
  const { data, error } = await db.rpc("reap_stale_jobs", { p_now: new Date().toISOString() });
  if (error) throw new Error(error.message);
  return (data as number) ?? 0;
}

/** Atomically lease up to `limit` ready jobs to `worker` (FOR UPDATE SKIP LOCKED). */
export async function claim(worker: string, limit: number, client?: SupabaseClient): Promise<JobRow[]> {
  const db = admin(client);
  const { data, error } = await db.rpc("claim_jobs", {
    p_worker: worker,
    p_limit: limit,
    p_now: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  return (data as JobRow[]) ?? [];
}

/** Extend a job's lease while its handler is still working. Returns whether
 * the caller still owns the lease (false = it was reaped/stolen — stop). */
export async function heartbeat(jobId: string, worker: string, client?: SupabaseClient): Promise<boolean> {
  const db = admin(client);
  const { data } = await db
    .from("jobs")
    .select("timeout_ms")
    .eq("id", jobId)
    .maybeSingle();
  const ttl = (data?.timeout_ms as number) ?? 300000;
  const { data: updated } = await db
    .from("jobs")
    .update({ lease_expires_at: new Date(Date.now() + ttl).toISOString(), updated_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("locked_by", worker)
    .eq("status", "running")
    .select("id");
  return Array.isArray(updated) && updated.length > 0;
}

/** Persist progress so a resumed/retried run can continue from here. */
export async function checkpoint(
  jobId: string,
  data: Record<string, unknown>,
  client?: SupabaseClient
): Promise<void> {
  const db = admin(client);
  await db.from("jobs").update({ checkpoint: data, updated_at: new Date().toISOString() }).eq("id", jobId);
}

/** Mark a job succeeded (terminal). */
export async function complete(
  jobId: string,
  finalCheckpoint?: Record<string, unknown>,
  client?: SupabaseClient
): Promise<void> {
  const db = admin(client);
  const now = new Date().toISOString();
  await db
    .from("jobs")
    .update({
      status: "succeeded",
      finished_at: now,
      locked_by: null,
      locked_at: null,
      lease_expires_at: null,
      last_error: null,
      updated_at: now,
      ...(finalCheckpoint ? { checkpoint: finalCheckpoint } : {}),
    })
    .eq("id", jobId);
}

/**
 * Returns a claimed job to the queue WITHOUT consuming an attempt.
 *
 * Used when a worker runs out of its time budget: holding a lease it cannot
 * honour would make the job invisible until the lease expired, so the queue
 * would look stuck for no reason. This is not a failure — the job never ran.
 */
export async function release(jobId: string, client?: SupabaseClient): Promise<void> {
  const db = admin(client);
  const now = new Date().toISOString();
  await db
    .from("jobs")
    .update({
      status: "queued",
      locked_by: null,
      locked_at: null,
      lease_expires_at: null,
      updated_at: now,
    })
    .eq("id", jobId);
}

/**
 * Failure escalation (M11 Phase D). A dead-lettered job is an operational
 * event, not a silent drop: record it in the EXISTING `event_log` sink (the
 * one the observability console already reads) so it is visible and
 * actionable. Best-effort — escalation must never mask the failure itself.
 */
async function escalateDeadJob(
  db: SupabaseClient,
  jobId: string,
  reason: string
): Promise<void> {
  try {
    const { data: job } = await db
      .from("jobs")
      .select("tenant_id, type, attempts, max_attempts, workflow_run_id")
      .eq("id", jobId)
      .maybeSingle();
    await db.from("event_log").insert({
      tenant_id: job?.tenant_id ?? null,
      level: "error",
      source: "job-engine",
      message: `Job dead-lettered (${job?.type ?? "unknown"}): ${reason}`.slice(0, 1000),
      meta: {
        job_id: jobId,
        job_type: job?.type ?? null,
        attempts: job?.attempts ?? null,
        max_attempts: job?.max_attempts ?? null,
        workflow_run_id: job?.workflow_run_id ?? null,
      },
    });

    // M15 O4 — a dead-lettered job also opens an operational incident, so it
    // lands in a queue someone owns instead of only in a log nobody reads.
    // Deduped per job, so retries of the same failure escalate one incident.
    if (job?.tenant_id) {
      const { raiseIncident } = await import("@/lib/ops/incidents");
      await raiseIncident({
        tenantId: job.tenant_id as string,
        title: `Job failed permanently: ${job.type ?? "unknown"}`,
        summary: reason.slice(0, 1000),
        severity: "high",
        source: "job.dead",
        dedupeKey: `job.dead:${jobId}`,
        jobId,
        client: db,
      });
    }
  } catch {
    // best-effort
  }
}

/** Dead-letter a job immediately, bypassing retries (non-retryable failure,
 * e.g. no handler registered for its type). */
export async function deadLetter(jobId: string, reason: string, client?: SupabaseClient): Promise<void> {
  const db = admin(client);
  const now = new Date().toISOString();
  await db
    .from("jobs")
    .update({
      status: "dead",
      dead_at: now,
      last_error: reason.slice(0, 1000),
      locked_by: null,
      locked_at: null,
      lease_expires_at: null,
      updated_at: now,
    })
    .eq("id", jobId);
  await escalateDeadJob(db, jobId, reason);
}

/**
 * Fail a job. Requeues with exponential backoff while attempts remain, else
 * dead-letters it (DLQ). `attempts` is the current attempt count on the row
 * (already incremented at claim time).
 */
export async function fail(
  job: Pick<JobRow, "id" | "attempts" | "max_attempts">,
  errorMessage: string,
  client?: SupabaseClient
): Promise<"queued" | "dead"> {
  const db = admin(client);
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const dead = isExhausted(job.attempts, job.max_attempts);

  await db
    .from("jobs")
    .update(
      dead
        ? {
            status: "dead",
            dead_at: now,
            last_error: errorMessage.slice(0, 1000),
            locked_by: null,
            locked_at: null,
            lease_expires_at: null,
            updated_at: now,
          }
        : {
            status: "queued",
            run_after: nextRunAfter(job.attempts, nowMs),
            last_error: errorMessage.slice(0, 1000),
            locked_by: null,
            locked_at: null,
            lease_expires_at: null,
            updated_at: now,
          }
    )
    .eq("id", job.id);

  if (dead) await escalateDeadJob(db, job.id, errorMessage);
  return dead ? "dead" : "queued";
}

/**
 * Operational re-drive (M11 Phase F/G): return a dead or stuck job to the
 * queue with a fresh retry budget. This is the sanctioned recovery path for a
 * dead-lettered job (including a DLQ'd scheduler slot) — it preserves the
 * job's identity and idempotency key, so re-running it cannot duplicate side
 * effects that are already idempotent.
 */
export async function redrive(
  jobId: string,
  opts?: { extraAttempts?: number },
  client?: SupabaseClient
): Promise<void> {
  const db = admin(client);
  const now = new Date().toISOString();
  const { data: job } = await db
    .from("jobs")
    .select("attempts, max_attempts")
    .eq("id", jobId)
    .maybeSingle();
  const attempts = (job?.attempts as number) ?? 0;
  const maxAttempts = (job?.max_attempts as number) ?? 3;
  const extra = opts?.extraAttempts ?? 3;

  await db
    .from("jobs")
    .update({
      status: "queued",
      run_after: now,
      dead_at: null,
      finished_at: null,
      locked_by: null,
      locked_at: null,
      lease_expires_at: null,
      // grant headroom so the job can actually run again
      max_attempts: Math.max(maxAttempts, attempts + extra),
      updated_at: now,
    })
    .eq("id", jobId);
}

/** Cancel a job that has not reached a terminal state. */
export async function cancelJob(jobId: string, reason: string, client?: SupabaseClient): Promise<boolean> {
  const db = admin(client);
  const now = new Date().toISOString();
  const { data } = await db
    .from("jobs")
    .update({
      status: "dead",
      dead_at: now,
      last_error: `cancelled: ${reason}`.slice(0, 1000),
      locked_by: null,
      locked_at: null,
      lease_expires_at: null,
      updated_at: now,
    })
    .eq("id", jobId)
    .in("status", ["queued", "running"])
    .select("id");
  return Array.isArray(data) && data.length > 0;
}
