import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueue } from "@/lib/jobs/engine";
import {
  readySteps,
  rollupRunStatus,
  type WorkflowDefinition,
  type WorkflowRunRow,
  type WorkflowStepDef,
  type WorkflowStepRow,
} from "@/lib/workflow/types";

/**
 * Workflow runtime (M11 Phase C) — orchestration ONLY. Every unit of work is a
 * durable job on the existing Job Engine; this layer decides what may start
 * next, propagates failure, and rolls the run up. It never leases, retries, or
 * executes anything itself (the engine owns all of that).
 *
 * Guarantees:
 *  - Idempotent start: (tenant, idempotency_key) unique -> one run.
 *  - Idempotent step launch: each step's job key is `wf:<runId>:<stepKey>`, so
 *    a re-advance (crash, duplicate trigger, retry) never double-enqueues.
 *  - Resume: run/step rows ARE the checkpoint; advancing is a pure function of
 *    persisted state, so it is safe to run repeatedly after any crash.
 *  - Tenant isolation: every row carries tenant_id; steps inherit the run's.
 */

function db(client?: SupabaseClient): SupabaseClient {
  return client ?? createAdminClient();
}

function stepJobKey(workflowRunId: string, stepKey: string): string {
  return `wf:${workflowRunId}:${stepKey}`;
}

export interface StartWorkflowInput {
  tenantId: string;
  definition: WorkflowDefinition;
  context?: Record<string, unknown>;
  /** Exactly-once workflow start for a given trigger. */
  idempotencyKey?: string;
}

/** Create a workflow run + its steps, then kick off coordination. */
export async function startWorkflow(
  input: StartWorkflowInput,
  client?: SupabaseClient
): Promise<WorkflowRunRow> {
  const admin = db(client);

  if (input.idempotencyKey) {
    const { data: existing } = await admin
      .from("workflow_runs")
      .select("id, tenant_id, workflow_key, status, context, definition, last_error")
      .eq("tenant_id", input.tenantId)
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();
    if (existing) return existing as WorkflowRunRow;
  }

  const { data: run, error } = await admin
    .from("workflow_runs")
    .insert({
      tenant_id: input.tenantId,
      workflow_key: input.definition.key,
      status: "running",
      context: input.context ?? {},
      definition: input.definition,
      idempotency_key: input.idempotencyKey ?? null,
    })
    .select("id, tenant_id, workflow_key, status, context, definition, last_error")
    .single();
  if (error || !run) throw new Error(error?.message ?? "Couldn't start the workflow.");

  const stepRows = input.definition.steps.map((s) => ({
    tenant_id: input.tenantId,
    workflow_run_id: run.id,
    step_key: s.key,
    job_type: s.jobType,
    depends_on: s.dependsOn ?? [],
    status: "pending",
    payload: s.payload ?? {},
  }));
  const { error: stepErr } = await admin.from("workflow_steps").insert(stepRows);
  if (stepErr) throw new Error(stepErr.message);

  // Coordination itself is a durable job — no synchronous chain.
  await enqueue(
    {
      tenantId: input.tenantId,
      type: "workflow.advance",
      idempotencyKey: `wf:advance:${run.id}:start`,
      payload: { workflowRunId: run.id },
      priority: 20, // coordination ahead of work so the DAG keeps moving
      workflowRunId: run.id,
    },
    admin
  );

  return run as WorkflowRunRow;
}

/**
 * Evaluate the DAG once: launch every step whose dependencies are satisfied
 * (in parallel), skip branch-disabled steps, propagate failure, and roll the
 * run up. Safe to call repeatedly — it is a pure function of persisted state.
 */
export async function advanceWorkflow(
  workflowRunId: string,
  client?: SupabaseClient
): Promise<{ status: string; launched: string[]; skipped: string[] }> {
  const admin = db(client);

  const { data: runRow } = await admin
    .from("workflow_runs")
    .select("id, tenant_id, workflow_key, status, context, definition, last_error")
    .eq("id", workflowRunId)
    .maybeSingle();
  if (!runRow) throw new Error("Workflow run not found.");
  const run = runRow as WorkflowRunRow;

  // Terminal runs are inert (idempotent no-op).
  if (run.status !== "running") {
    return { status: run.status, launched: [], skipped: [] };
  }

  const { data: stepRows } = await admin
    .from("workflow_steps")
    .select("id, tenant_id, workflow_run_id, step_key, job_type, depends_on, status, payload, output, job_id, attempts, last_error")
    .eq("workflow_run_id", workflowRunId);
  const steps = (stepRows ?? []) as WorkflowStepRow[];

  // Failure propagation: one terminally-failed step fails the whole run and
  // skips whatever had not started.
  if (steps.some((s) => s.status === "failed")) {
    const pending = steps.filter((s) => s.status === "pending").map((s) => s.id);
    if (pending.length) {
      await admin
        .from("workflow_steps")
        .update({ status: "skipped", updated_at: new Date().toISOString() })
        .in("id", pending);
    }
    await admin
      .from("workflow_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        last_error: steps.find((s) => s.status === "failed")?.last_error ?? "a step failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", workflowRunId);
    return { status: "failed", launched: [], skipped: [] };
  }

  const defs = ((run.definition as WorkflowDefinition)?.steps ?? []) as WorkflowStepDef[];

  // Resolve the DAG to a fixed point in ONE pass. Skipping a branch-disabled
  // step immediately satisfies its dependents, which may themselves be
  // skippable — and because a skip enqueues no job, nothing would settle later
  // to re-trigger coordination. So cascade the skips here until stable, then
  // launch whatever became runnable.
  const local = steps.map((s) => ({ ...s }));
  const skippable: string[] = [];
  const runnable: string[] = [];
  for (let guard = 0; guard < 500; guard++) {
    const next = readySteps(local, defs, run.context ?? {});
    const freshSkips = next.skippable.filter((k) => !skippable.includes(k));
    const freshRuns = next.runnable.filter((k) => !runnable.includes(k));
    for (const k of freshSkips) {
      const s = local.find((x) => x.step_key === k);
      if (s) s.status = "skipped";
    }
    for (const k of freshRuns) {
      // mark locally so the next iteration doesn't re-pick it
      const s = local.find((x) => x.step_key === k);
      if (s) s.status = "running";
    }
    skippable.push(...freshSkips);
    runnable.push(...freshRuns);
    if (freshSkips.length === 0 && freshRuns.length === 0) break;
  }

  // Branch-disabled steps are skipped so downstream deps stay unblocked.
  if (skippable.length) {
    await admin
      .from("workflow_steps")
      .update({ status: "skipped", updated_at: new Date().toISOString() })
      .eq("workflow_run_id", workflowRunId)
      .in("step_key", skippable);
  }

  // Launch all ready steps — independent ones start together (parallel).
  const launched: string[] = [];
  for (const key of runnable) {
    const step = steps.find((s) => s.step_key === key);
    if (!step) continue;
    const def = defs.find((d) => d.key === key);
    const job = await enqueue(
      {
        tenantId: run.tenant_id,
        type: step.job_type,
        idempotencyKey: stepJobKey(workflowRunId, key), // exactly-once launch
        payload: { ...(run.context ?? {}), ...(step.payload ?? {}), workflowRunId, stepKey: key },
        priority: def?.priority ?? 5,
        workflowRunId,
        workflowStepId: step.id,
      },
      admin
    );
    await admin
      .from("workflow_steps")
      .update({ status: "running", job_id: job.id, updated_at: new Date().toISOString() })
      .eq("id", step.id);
    launched.push(key);
  }

  // Roll up if everything is terminal (`local` already reflects this pass).
  const rolled = rollupRunStatus(local);
  if (rolled === "succeeded") {
    await admin
      .from("workflow_runs")
      .update({ status: "succeeded", finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", workflowRunId);
    return { status: "succeeded", launched, skipped: skippable };
  }

  return { status: "running", launched, skipped: skippable };
}

/**
 * Called by the job runner when a workflow-linked job settles. Only a job that
 * reached a TERMINAL state moves its step: a retryable failure leaves the step
 * `running` (the engine will retry the same job). Then coordination is queued
 * as another durable job.
 */
export async function onStepJobSettled(
  job: { id: string; tenant_id: string | null; workflow_run_id: string | null; workflow_step_id: string | null; attempts: number },
  outcome: "succeeded" | "retrying" | "dead",
  detail: { output?: Record<string, unknown>; error?: string },
  client?: SupabaseClient
): Promise<void> {
  if (!job.workflow_run_id || !job.workflow_step_id || !job.tenant_id) return;
  const admin = db(client);
  const now = new Date().toISOString();

  if (outcome === "retrying") {
    await admin
      .from("workflow_steps")
      .update({ attempts: job.attempts, last_error: detail.error ?? null, updated_at: now })
      .eq("id", job.workflow_step_id);
    return; // engine will retry the same job; DAG unchanged
  }

  await admin
    .from("workflow_steps")
    .update({
      status: outcome === "succeeded" ? "succeeded" : "failed",
      output: detail.output ?? {},
      last_error: outcome === "dead" ? (detail.error ?? "job dead-lettered") : null,
      attempts: job.attempts,
      updated_at: now,
    })
    .eq("id", job.workflow_step_id);

  // Merge the step's output into the run context so downstream steps and
  // branch conditions can read it (this is the workflow checkpoint).
  if (outcome === "succeeded" && detail.output) {
    const { data: runRow } = await admin
      .from("workflow_runs")
      .select("context")
      .eq("id", job.workflow_run_id)
      .maybeSingle();
    const context = ((runRow?.context ?? {}) as Record<string, unknown>) ?? {};
    await admin
      .from("workflow_runs")
      .update({ context: { ...context, [`${job.workflow_step_id}`]: detail.output }, updated_at: now })
      .eq("id", job.workflow_run_id);
  }

  await enqueue(
    {
      tenantId: job.tenant_id,
      type: "workflow.advance",
      payload: { workflowRunId: job.workflow_run_id },
      priority: 20,
      workflowRunId: job.workflow_run_id,
    },
    admin
  );
}
