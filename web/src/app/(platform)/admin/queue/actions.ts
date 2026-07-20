"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/admin/guard";
import { writeAuditLog } from "@/lib/admin/audit";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/** Run statuses that are terminal — nothing further will move them. */
const TERMINAL_RUN = new Set(["done", "cancelled"]);
/** Run statuses eligible to be retried (re-queued). */
const RETRYABLE_RUN = new Set(["failed", "cancelled"]);
/** Stage statuses considered "open" (still in flight) when cancelling. */
const OPEN_STAGE = ["pending", "running", "awaiting_review", "regenerating", "awaiting_payment"];
/** Stage statuses considered a failure to reset on retry. */
const FAILED_STAGE = ["failed", "rejected"];

async function loadRun(runId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pipeline_runs")
    .select("id, tenant_id, status")
    .eq("id", runId)
    .maybeSingle();
  return data as { id: string; tenant_id: string | null; status: string } | null;
}

/**
 * Re-queue a failed or cancelled run (Queue/Job Manager — P2-05). The run's
 * failed/rejected stages are reset to `pending` (attempts incremented, error
 * cleared) and the run returns to `running`, pointed at the earliest reset
 * stage. In dry/mock mode there is no autonomous worker, so the run resumes
 * through the existing review/advance loop at /pipeline — this action makes it
 * runnable again, it does not itself execute a stage.
 */
export async function retryRunAction(runId: string): Promise<ActionResult> {
  const profile = await requireSuperAdmin();
  const run = await loadRun(runId);
  if (!run) return { ok: false, error: "Run not found." };
  if (!RETRYABLE_RUN.has(run.status)) {
    return { ok: false, error: `Only failed or cancelled runs can be retried (this run is ${run.status}).` };
  }

  const supabase = await createClient();

  // Reset the failed/rejected stages so the run has something to resume into.
  const { data: failedStages, error: loadError } = await supabase
    .from("pipeline_stages")
    .select("id, seq, stage, attempts")
    .eq("run_id", runId)
    .in("status", FAILED_STAGE)
    .order("seq", { ascending: true });
  if (loadError) return { ok: false, error: loadError.message };

  const stages = (failedStages ?? []) as { id: string; seq: number; stage: string; attempts: number | null }[];
  for (const stage of stages) {
    const { error: stageError } = await supabase
      .from("pipeline_stages")
      .update({
        status: "pending",
        last_error: null,
        attempts: (stage.attempts ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", stage.id);
    if (stageError) return { ok: false, error: stageError.message };
  }

  const resumeStage = stages[0]?.stage ?? null;
  const { error: runError } = await supabase
    .from("pipeline_runs")
    .update({
      status: "running",
      finished_at: null,
      ...(resumeStage ? { current_stage: resumeStage } : {}),
    })
    .eq("id", runId);
  if (runError) return { ok: false, error: runError.message };

  await writeAuditLog({
    actorId: profile.user_id,
    action: "queue.retry_run",
    targetType: "pipeline_run",
    targetId: runId,
    tenantId: run.tenant_id,
    meta: { from_status: run.status, reset_stages: stages.length, resume_stage: resumeStage },
  });

  revalidatePath("/admin/queue");
  revalidatePath(`/admin/queue/${runId}`);
  return { ok: true };
}

/**
 * Cancel a non-terminal run — the operator kill switch (Queue/Job Manager —
 * P2-05). Sets the run to `cancelled` with a finish timestamp and marks any
 * still-open stages `skipped` so the run's detail view stays coherent.
 */
export async function cancelRunAction(runId: string): Promise<ActionResult> {
  const profile = await requireSuperAdmin();
  const run = await loadRun(runId);
  if (!run) return { ok: false, error: "Run not found." };
  if (TERMINAL_RUN.has(run.status)) {
    return { ok: false, error: `Run is already ${run.status}.` };
  }

  const supabase = await createClient();

  const now = new Date().toISOString();
  const { error: runError } = await supabase
    .from("pipeline_runs")
    .update({ status: "cancelled", finished_at: now })
    .eq("id", runId);
  if (runError) return { ok: false, error: runError.message };

  // Best-effort: close out any in-flight stages so nothing reads as active.
  await supabase
    .from("pipeline_stages")
    .update({ status: "skipped", updated_at: now })
    .eq("run_id", runId)
    .in("status", OPEN_STAGE);

  await writeAuditLog({
    actorId: profile.user_id,
    action: "queue.cancel_run",
    targetType: "pipeline_run",
    targetId: runId,
    tenantId: run.tenant_id,
    meta: { from_status: run.status },
  });

  revalidatePath("/admin/queue");
  revalidatePath(`/admin/queue/${runId}`);
  return { ok: true };
}
