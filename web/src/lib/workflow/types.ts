/**
 * Workflow / DAG definitions (M11 Phase C). A workflow is a set of steps, each
 * of which runs as a DURABLE JOB via the existing Job Engine. The workflow
 * layer only decides WHAT may run next; the engine owns leasing, retry,
 * backoff and DLQ. Pure types + helpers (no server-only) so they are testable.
 */

export interface WorkflowStepDef {
  /** Unique within the workflow. */
  key: string;
  /** A registered job type (see lib/jobs/registry). */
  jobType: string;
  /** step_keys that must reach a terminal-success/skip state first. */
  dependsOn?: string[];
  /** Non-secret step inputs merged into the job payload. */
  payload?: Record<string, unknown>;
  /** Optional conditional branch: run only when context[key] equals value. */
  when?: { contextKey: string; equals: unknown };
  priority?: number;
}

export interface WorkflowDefinition {
  key: string;
  steps: WorkflowStepDef[];
}

export type WorkflowRunStatus = "running" | "succeeded" | "failed" | "cancelled";
export type WorkflowStepStatus = "pending" | "running" | "succeeded" | "failed" | "skipped";

export interface WorkflowStepRow {
  id: string;
  tenant_id: string;
  workflow_run_id: string;
  step_key: string;
  job_type: string;
  depends_on: string[];
  status: string;
  payload: Record<string, unknown>;
  output: Record<string, unknown>;
  job_id: string | null;
  attempts: number;
  last_error: string | null;
}

export interface WorkflowRunRow {
  id: string;
  tenant_id: string;
  workflow_key: string;
  status: string;
  context: Record<string, unknown>;
  definition: WorkflowDefinition | Record<string, unknown>;
  last_error: string | null;
}

/** A dependency is satisfied when it succeeded OR was skipped by a branch. */
export function depSatisfied(status: string): boolean {
  return status === "succeeded" || status === "skipped";
}

/** Evaluate a step's optional conditional branch against the run context. */
export function branchAllows(
  step: Pick<WorkflowStepDef, "when">,
  context: Record<string, unknown>
): boolean {
  if (!step.when) return true;
  return context[step.when.contextKey] === step.when.equals;
}

/**
 * Which pending steps are ready to start: every dependency satisfied. Returns
 * them in definition order. Steps whose branch condition is false are returned
 * separately so the caller can mark them skipped (keeping the DAG unblocked).
 */
export function readySteps(
  steps: Array<Pick<WorkflowStepRow, "step_key" | "status" | "depends_on">>,
  defs: WorkflowStepDef[],
  context: Record<string, unknown>
): { runnable: string[]; skippable: string[] } {
  const byKey = new Map(steps.map((s) => [s.step_key, s]));
  const defByKey = new Map(defs.map((d) => [d.key, d]));
  const runnable: string[] = [];
  const skippable: string[] = [];

  for (const step of steps) {
    if (step.status !== "pending") continue;
    const deps = step.depends_on ?? [];
    const allDone = deps.every((d) => depSatisfied(byKey.get(d)?.status ?? "pending"));
    if (!allDone) continue;
    const def = defByKey.get(step.step_key);
    if (def && !branchAllows(def, context)) skippable.push(step.step_key);
    else runnable.push(step.step_key);
  }
  return { runnable, skippable };
}

/** Terminal roll-up for a run given its steps. */
export function rollupRunStatus(
  steps: Array<Pick<WorkflowStepRow, "status">>
): WorkflowRunStatus | null {
  if (steps.some((s) => s.status === "failed")) return "failed";
  if (steps.every((s) => s.status === "succeeded" || s.status === "skipped")) return "succeeded";
  return null; // still in flight
}
