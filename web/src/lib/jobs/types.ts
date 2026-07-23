/**
 * Durable Job Engine types (M11-1 / ISS-P5-02, ADR-030). The engine turns the
 * `jobs` table into a crash-safe, idempotent, leased work queue. Handlers are
 * provider-independent and registered by job `type`.
 */

/** Lifecycle: queued -> running -> succeeded; failed -> queued (retry) -> dead. */
export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "dead";

export interface JobRow {
  id: string;
  tenant_id: string | null;
  run_id: string | null;
  type: string;
  status: string;
  priority: number;
  attempts: number;
  max_attempts: number;
  idempotency_key: string | null;
  payload: Record<string, unknown>;
  checkpoint: Record<string, unknown>;
  last_error: string | null;
  run_after: string | null;
  locked_by: string | null;
  locked_at: string | null;
  lease_expires_at: string | null;
  timeout_ms: number;
  started_at: string | null;
  finished_at: string | null;
  dead_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  /** Set when this job executes a workflow DAG node (M11 Phase C). */
  workflow_run_id: string | null;
  workflow_step_id: string | null;
}

export interface EnqueueInput {
  tenantId: string;
  type: string;
  payload?: Record<string, unknown>;
  /** Dedupe key — a second enqueue with the same (tenant, key) returns the
   * existing job instead of creating a duplicate (exactly-once enqueue). */
  idempotencyKey?: string;
  priority?: number;
  runId?: string | null;
  /** Earliest execution time (ISO). Defaults to now. */
  runAfter?: string;
  maxAttempts?: number;
  timeoutMs?: number;
  /** Links this job to a workflow DAG node (M11 Phase C). */
  workflowRunId?: string | null;
  workflowStepId?: string | null;
}

/**
 * A job handler does the real work. It receives the leased job; anything it
 * returns as `checkpoint` is persisted (resume/forensics). Throwing triggers
 * the retry/backoff/DLQ path. Handlers MUST derive tenant scope from
 * `job.tenant_id` (never trust payload for isolation).
 */
export type JobHandler = (job: JobRow) => Promise<{ checkpoint?: Record<string, unknown> } | void>;

export interface ProcessSummary {
  worker: string;
  reaped: number;
  claimed: number;
  succeeded: number;
  failed: number;
  dead: number;
  /** Claimed but released unrun because the pass ran out of time budget. */
  deferred: number;
}

/**
 * A terminal failure that retrying cannot fix (missing/invalid configuration,
 * a closed gate, an exhausted budget, an open provider circuit, a malformed
 * payload). The runner dead-letters these immediately instead of burning the
 * retry budget — this is what prevents retry storms on permanent conditions.
 */
export class NonRetryableJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableJobError";
  }
}
