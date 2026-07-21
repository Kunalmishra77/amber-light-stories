"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/auth";
import { logAudit } from "@/lib/ops/audit";
import { notify } from "@/lib/ops/notify";
import {
  getStagePreview,
  isPaidStage,
  isGatedStage,
  gatedStageReason,
  stageLabel,
  STAGE_ORDER,
  type SceneForContent,
  type StoryForContent,
} from "@/lib/pipeline/stage-content";
import type {
  PipelineRunRow,
  PipelineStageRow,
} from "@/lib/pipeline/types";
import { PublishTargetMissingError } from "@/lib/publishing/publish";
import { enqueue } from "@/lib/jobs/engine";
import { publishJobKey } from "@/lib/jobs/handlers/publish";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const PAID_GUARD_MESSAGE =
  "This is a paid generation stage. It only runs during Phase 5 with explicit paid-run permission — it cannot be approved, regenerated, or retried from here.";

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function loadStage(
  supabase: Supabase,
  tenantId: string,
  stageId: string
): Promise<PipelineStageRow | null> {
  const { data } = await supabase
    .from("pipeline_stages")
    .select("*")
    .eq("id", stageId)
    .eq("tenant_id", tenantId)
    .maybeSingle<PipelineStageRow>();
  return data ?? null;
}

async function loadRun(
  supabase: Supabase,
  tenantId: string,
  runId: string
): Promise<PipelineRunRow | null> {
  const { data } = await supabase
    .from("pipeline_runs")
    .select("*")
    .eq("id", runId)
    .eq("tenant_id", tenantId)
    .maybeSingle<PipelineRunRow>();
  return data ?? null;
}

async function loadStoryAndScenes(
  supabase: Supabase,
  tenantId: string,
  storyId: string | null
): Promise<{ story: StoryForContent; scenes: SceneForContent[] }> {
  const emptyStory: StoryForContent = {
    id: storyId ?? "",
    topic: null,
    logline: null,
    moral: null,
    duration_seconds: null,
    beat_sheet: null,
  };

  if (!storyId) return { story: emptyStory, scenes: [] };

  const [{ data: story }, { data: scenes }] = await Promise.all([
    supabase
      .from("stories")
      .select("id, topic, logline, moral, duration_seconds, beat_sheet")
      .eq("id", storyId)
      .eq("tenant_id", tenantId)
      .maybeSingle<StoryForContent>(),
    supabase
      .from("scenes")
      .select(
        "id, seq, start_sec, end_sec, narration, subtitle, importance, motion_type, recommended_quality, animate, prompt"
      )
      .eq("story_id", storyId)
      .eq("tenant_id", tenantId)
      .order("seq", { ascending: true }),
  ]);

  return {
    story: story ?? emptyStory,
    scenes: (scenes as SceneForContent[] | null) ?? [],
  };
}

function revalidate() {
  revalidatePath("/pipeline");
  // A completed run may have produced a publication + a new video.
  revalidatePath("/publishing");
  revalidatePath("/videos");
}

/** Resolves the authed client + active tenant, or a ready-made error result. */
async function requireContext(): Promise<
  { supabase: Supabase; tenantId: string } | { error: ActionResult }
> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) {
    return { error: { ok: false, error: "You're not a member of any workspace." } };
  }
  const supabase = await createClient();
  return { supabase, tenantId };
}

/**
 * Approve the given stage's output and advance the run to the next stage.
 * Free/planning stages get their preview content populated and are set to
 * `awaiting_review`. Paid stages are never auto-run — the run is parked at
 * an `awaiting_payment` gate instead.
 */
export async function approveStage(stageId: string): Promise<ActionResult> {
  const ctx = await requireContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, tenantId } = ctx;

  const stage = await loadStage(supabase, tenantId, stageId);
  if (!stage) return { ok: false, error: "Stage not found." };

  if (isPaidStage(stage.stage)) {
    return { ok: false, error: PAID_GUARD_MESSAGE };
  }

  // Publishing the run needs a connected channel — fail fast BEFORE marking the
  // terminal stage done, so the customer can connect one and re-approve.
  if (stage.stage === "publish") {
    try {
      const { getPublishingTarget } = await import("@/lib/providers/publishing");
      const target = await getPublishingTarget(tenantId, "youtube");
      if (!target) return { ok: false, error: new PublishTargetMissingError().message };
    } catch {
      // Resolver failure shouldn't hard-block; publishRun re-checks below.
    }
  }

  const { error: updateError } = await supabase
    .from("pipeline_stages")
    .update({ status: "done", approved_at: new Date().toISOString() })
    .eq("id", stageId)
    .eq("tenant_id", tenantId);
  if (updateError) return { ok: false, error: updateError.message };

  const run = await loadRun(supabase, tenantId, stage.run_id);
  if (!run) return { ok: false, error: "Run not found." };

  // Advance to the next ACTIONABLE stage: execution-gated stages (trend,
  // competitor, fact_verify, story_enhance, learning) are explicitly skipped
  // with their blocking dependency recorded — they never fabricate output.
  let next: PipelineStageRow | null = null;
  let probeSeq = stage.seq + 1;
  for (let guard = 0; guard < STAGE_ORDER.length + 1; guard++) {
    const { data: candidate } = await supabase
      .from("pipeline_stages")
      .select("*")
      .eq("run_id", stage.run_id)
      .eq("seq", probeSeq)
      .eq("tenant_id", tenantId)
      .maybeSingle<PipelineStageRow>();
    if (!candidate) break;
    if (!isGatedStage(candidate.stage)) {
      next = candidate;
      break;
    }
    await supabase
      .from("pipeline_stages")
      .update({
        status: "skipped",
        output: {
          ...getStagePreview(candidate.stage, { id: "", topic: null, logline: null, moral: null, duration_seconds: null, beat_sheet: null }, []),
          gated: true,
          gatedReason: gatedStageReason(candidate.stage),
          skippedAt: new Date().toISOString(),
        },
      })
      .eq("id", candidate.id)
      .eq("tenant_id", tenantId);
    probeSeq++;
  }

  await logAudit({
    action: "pipeline.approve_stage",
    target: `pipeline_stage:${stageId}`,
    meta: { stage: stage.stage, run_id: stage.run_id },
    tenantId,
  });

  // Approving `publish` hands the publication to the durable Job Engine
  // (M11 Phase B) instead of publishing inline, so it retries and dead-letters
  // like every other execution path. The channel pre-check above already failed
  // fast if no destination is connected. This is keyed on the STAGE, not on
  // terminality, because `learning` now follows `publish` (M12 G6).
  if (stage.stage === "publish") {
    try {
      await enqueue(
        {
          tenantId,
          type: "publish.run",
          idempotencyKey: publishJobKey(run.id), // one publish job per run
          payload: { runId: run.id, storyId: run.story_id },
          priority: 10, // publications are user-visible: ahead of background work
        },
        supabase
      );
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Couldn't queue the publication.",
      };
    }
  }

  if (!next) {
    // Last stage — run complete.
    await supabase
      .from("pipeline_runs")
      .update({
        status: "done",
        current_stage: null,
        finished_at: new Date().toISOString(),
      })
      .eq("id", run.id)
      .eq("tenant_id", tenantId);
    revalidate();
    return { ok: true };
  }

  if (isPaidStage(next.stage)) {
    await supabase
      .from("pipeline_runs")
      .update({ current_stage: next.stage, status: "awaiting_payment" })
      .eq("id", run.id)
      .eq("tenant_id", tenantId);
    revalidate();
    return { ok: true };
  }

  const { story, scenes } = await loadStoryAndScenes(supabase, tenantId, run.story_id);
  const preview = getStagePreview(next.stage, story, scenes);

  const { error: nextError } = await supabase
    .from("pipeline_stages")
    .update({
      status: "awaiting_review",
      output: { ...preview, generatedAt: new Date().toISOString() },
    })
    .eq("id", next.id)
    .eq("tenant_id", tenantId);
  if (nextError) return { ok: false, error: nextError.message };

  const { error: runError } = await supabase
    .from("pipeline_runs")
    .update({ current_stage: next.stage, status: "running" })
    .eq("id", run.id)
    .eq("tenant_id", tenantId);
  if (runError) return { ok: false, error: runError.message };

  await notify({
    tenantId,
    kind: "pipeline_review",
    title: `Awaiting review: ${stageLabel(next.stage)}`,
    body: story.topic ? `"${story.topic}" is ready for your review.` : undefined,
  });

  revalidate();
  return { ok: true };
}

export async function rejectStage(
  stageId: string,
  reason: string
): Promise<ActionResult> {
  const ctx = await requireContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, tenantId } = ctx;

  const stage = await loadStage(supabase, tenantId, stageId);
  if (!stage) return { ok: false, error: "Stage not found." };

  const { error: stageError } = await supabase
    .from("pipeline_stages")
    .update({ status: "rejected", last_error: reason || "Rejected by reviewer." })
    .eq("id", stageId)
    .eq("tenant_id", tenantId);
  if (stageError) return { ok: false, error: stageError.message };

  const { error: runError } = await supabase
    .from("pipeline_runs")
    .update({ status: "paused" })
    .eq("id", stage.run_id)
    .eq("tenant_id", tenantId);
  if (runError) return { ok: false, error: runError.message };

  await logAudit({
    action: "pipeline.reject_stage",
    target: `pipeline_stage:${stageId}`,
    meta: { stage: stage.stage, run_id: stage.run_id, reason },
    tenantId,
  });

  await notify({
    tenantId,
    kind: "pipeline_error",
    title: `Stage rejected: ${stageLabel(stage.stage)}`,
    body: reason || undefined,
  });

  revalidate();
  return { ok: true };
}

export async function regenerateStage(stageId: string): Promise<ActionResult> {
  const ctx = await requireContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, tenantId } = ctx;

  const stage = await loadStage(supabase, tenantId, stageId);
  if (!stage) return { ok: false, error: "Stage not found." };

  if (isPaidStage(stage.stage)) {
    return { ok: false, error: PAID_GUARD_MESSAGE };
  }

  const { count } = await supabase
    .from("stage_versions")
    .select("id", { count: "exact", head: true })
    .eq("stage_id", stageId)
    .eq("tenant_id", tenantId);
  const newVersion = (count ?? 0) + 1;

  if (stage.output) {
    const { error: versionError } = await supabase.from("stage_versions").insert({
      tenant_id: tenantId,
      stage_id: stageId,
      version: newVersion,
      output: stage.output,
      cost_usd: stage.cost_usd,
      model: stage.model,
    });
    if (versionError) return { ok: false, error: versionError.message };
  }

  const run = await loadRun(supabase, tenantId, stage.run_id);
  const { story, scenes } = await loadStoryAndScenes(
    supabase,
    tenantId,
    run?.story_id ?? null
  );
  const fresh = getStagePreview(stage.stage, story, scenes);

  const { error: updateError } = await supabase
    .from("pipeline_stages")
    .update({
      status: "awaiting_review",
      output: { ...fresh, generatedAt: new Date().toISOString() },
      attempts: (stage.attempts ?? 0) + 1,
    })
    .eq("id", stageId)
    .eq("tenant_id", tenantId);
  if (updateError) return { ok: false, error: updateError.message };

  await logAudit({
    action: "pipeline.regenerate_stage",
    target: `pipeline_stage:${stageId}`,
    meta: { stage: stage.stage, version: newVersion },
    tenantId,
  });

  revalidate();
  return { ok: true };
}

export async function editStage(
  stageId: string,
  outputText: string
): Promise<ActionResult> {
  const ctx = await requireContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, tenantId } = ctx;

  const stage = await loadStage(supabase, tenantId, stageId);
  if (!stage) return { ok: false, error: "Stage not found." };

  const trimmed = outputText.trim();
  const output = {
    stage: stage.stage,
    title: stageLabel(stage.stage),
    paid: isPaidStage(stage.stage),
    summary: trimmed.slice(0, 140),
    sections: [{ label: "Edited content", value: trimmed || "—" }],
    editedManually: true,
    generatedAt: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("pipeline_stages")
    .update({ output })
    .eq("id", stageId)
    .eq("tenant_id", tenantId);
  if (error) return { ok: false, error: error.message };

  revalidate();
  return { ok: true };
}

export async function rollbackToStage(
  runId: string,
  seq: number
): Promise<ActionResult> {
  const ctx = await requireContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, tenantId } = ctx;

  const { error: resetError } = await supabase
    .from("pipeline_stages")
    .update({ status: "pending", output: null, approved_at: null })
    .eq("run_id", runId)
    .eq("tenant_id", tenantId)
    .gt("seq", seq);
  if (resetError) return { ok: false, error: resetError.message };

  const { data: target } = await supabase
    .from("pipeline_stages")
    .select("*")
    .eq("run_id", runId)
    .eq("seq", seq)
    .eq("tenant_id", tenantId)
    .maybeSingle<PipelineStageRow>();
  if (!target) return { ok: false, error: "Target stage not found." };

  await logAudit({
    action: "pipeline.rollback",
    target: `pipeline_run:${runId}`,
    meta: { seq, stage: target.stage },
    tenantId,
  });

  if (isPaidStage(target.stage)) {
    const { error: runError } = await supabase
      .from("pipeline_runs")
      .update({ current_stage: target.stage, status: "awaiting_payment" })
      .eq("id", runId)
      .eq("tenant_id", tenantId);
    if (runError) return { ok: false, error: runError.message };
    revalidate();
    return { ok: true };
  }

  const run = await loadRun(supabase, tenantId, runId);
  const { story, scenes } = await loadStoryAndScenes(
    supabase,
    tenantId,
    run?.story_id ?? null
  );
  const preview = getStagePreview(target.stage, story, scenes);

  const { error: targetError } = await supabase
    .from("pipeline_stages")
    .update({
      status: "awaiting_review",
      output: { ...preview, generatedAt: new Date().toISOString() },
    })
    .eq("id", target.id)
    .eq("tenant_id", tenantId);
  if (targetError) return { ok: false, error: targetError.message };

  const { error: runError } = await supabase
    .from("pipeline_runs")
    .update({ current_stage: target.stage, status: "running" })
    .eq("id", runId)
    .eq("tenant_id", tenantId);
  if (runError) return { ok: false, error: runError.message };

  revalidate();
  return { ok: true };
}

export async function retryStage(stageId: string): Promise<ActionResult> {
  const ctx = await requireContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, tenantId } = ctx;

  const stage = await loadStage(supabase, tenantId, stageId);
  if (!stage) return { ok: false, error: "Stage not found." };

  if (isPaidStage(stage.stage)) {
    return { ok: false, error: PAID_GUARD_MESSAGE };
  }

  const { error } = await supabase
    .from("pipeline_stages")
    .update({ status: "awaiting_review", attempts: (stage.attempts ?? 0) + 1 })
    .eq("id", stageId)
    .eq("tenant_id", tenantId);
  if (error) return { ok: false, error: error.message };

  revalidate();
  return { ok: true };
}

export async function pauseRun(runId: string): Promise<ActionResult> {
  const ctx = await requireContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, tenantId } = ctx;

  const { error } = await supabase
    .from("pipeline_runs")
    .update({ status: "paused" })
    .eq("id", runId)
    .eq("tenant_id", tenantId);
  if (error) return { ok: false, error: error.message };

  revalidate();
  return { ok: true };
}

export async function resumeRun(runId: string): Promise<ActionResult> {
  const ctx = await requireContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, tenantId } = ctx;

  const run = await loadRun(supabase, tenantId, runId);
  if (!run) return { ok: false, error: "Run not found." };

  if (run.status === "awaiting_payment") {
    return {
      ok: false,
      error:
        "This run is parked at a paid-stage gate. Unlocking it requires Phase 5 paid-run permission, not a resume.",
    };
  }

  const { error } = await supabase
    .from("pipeline_runs")
    .update({ status: "running" })
    .eq("id", runId)
    .eq("tenant_id", tenantId);
  if (error) return { ok: false, error: error.message };

  revalidate();
  return { ok: true };
}
