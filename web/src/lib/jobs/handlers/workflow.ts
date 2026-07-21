import "server-only";
import { advanceWorkflow } from "@/lib/workflow/engine";
import { NonRetryableJobError } from "@/lib/jobs/types";
import type { JobHandler } from "@/lib/jobs/types";

/**
 * `workflow.advance` (M11 Phase C) — the DAG coordinator, itself a durable job
 * so coordination inherits the engine's retry/backoff/DLQ instead of being a
 * synchronous chain. Advancing is idempotent: it is a pure function of the
 * persisted run/step state, so duplicate or retried advances are harmless.
 */
export const workflowAdvanceHandler: JobHandler = async (job) => {
  if (!job.tenant_id) throw new Error("workflow.advance job is missing tenant_id");

  const workflowRunId =
    (job.payload?.workflowRunId as string | undefined) ?? job.workflow_run_id ?? undefined;
  if (!workflowRunId) throw new NonRetryableJobError("workflow.advance payload is missing workflowRunId");

  const result = await advanceWorkflow(workflowRunId);
  return { checkpoint: { ...result } };
};
