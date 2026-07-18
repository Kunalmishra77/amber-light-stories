"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getStagePreview,
  isPaidStage,
  stageLabel,
  type SceneForContent,
  type StoryForContent,
} from "@/lib/pipeline/stage-content";
import type {
  PipelineRunRow,
  PipelineStageRow,
} from "@/lib/pipeline/types";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const PAID_GUARD_MESSAGE =
  "This is a paid generation stage. It only runs during Phase 5 with explicit paid-run permission — it cannot be approved, regenerated, or retried from here.";

async function loadStage(
  supabase: ReturnType<typeof createAdminClient>,
  stageId: string
): Promise<PipelineStageRow | null> {
  const { data } = await supabase
    .from("pipeline_stages")
    .select("*")
    .eq("id", stageId)
    .maybeSingle<PipelineStageRow>();
  return data ?? null;
}

async function loadRun(
  supabase: ReturnType<typeof createAdminClient>,
  runId: string
): Promise<PipelineRunRow | null> {
  const { data } = await supabase
    .from("pipeline_runs")
    .select("*")
    .eq("id", runId)
    .maybeSingle<PipelineRunRow>();
  return data ?? null;
}

async function loadStoryAndScenes(
  supabase: ReturnType<typeof createAdminClient>,
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
      .maybeSingle<StoryForContent>(),
    supabase
      .from("scenes")
      .select(
        "id, seq, start_sec, end_sec, narration, subtitle, importance, motion_type, recommended_quality, animate, prompt"
      )
      .eq("story_id", storyId)
      .order("seq", { ascending: true }),
  ]);

  return {
    story: story ?? emptyStory,
    scenes: (scenes as SceneForContent[] | null) ?? [],
  };
}

function revalidate() {
  revalidatePath("/pipeline");
}

/**
 * Approve the given stage's output and advance the run to the next stage.
 * Free/planning stages get their preview content populated and are set to
 * `awaiting_review`. Paid stages are never auto-run — the run is parked at
 * an `awaiting_payment` gate instead.
 */
export async function approveStage(stageId: string): Promise<ActionResult> {
  const supabase = createAdminClient();

  const stage = await loadStage(supabase, stageId);
  if (!stage) return { ok: false, error: "Stage not found." };

  if (isPaidStage(stage.stage)) {
    return { ok: false, error: PAID_GUARD_MESSAGE };
  }

  const { error: updateError } = await supabase
    .from("pipeline_stages")
    .update({ status: "done", approved_at: new Date().toISOString() })
    .eq("id", stageId);
  if (updateError) return { ok: false, error: updateError.message };

  const run = await loadRun(supabase, stage.run_id);
  if (!run) return { ok: false, error: "Run not found." };

  const { data: next } = await supabase
    .from("pipeline_stages")
    .select("*")
    .eq("run_id", stage.run_id)
    .eq("seq", stage.seq + 1)
    .maybeSingle<PipelineStageRow>();

  if (!next) {
    // Last stage — run complete.
    await supabase
      .from("pipeline_runs")
      .update({
        status: "done",
        current_stage: null,
        finished_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    revalidate();
    return { ok: true };
  }

  if (isPaidStage(next.stage)) {
    await supabase
      .from("pipeline_runs")
      .update({ current_stage: next.stage, status: "awaiting_payment" })
      .eq("id", run.id);
    revalidate();
    return { ok: true };
  }

  const { story, scenes } = await loadStoryAndScenes(supabase, run.story_id);
  const preview = getStagePreview(next.stage, story, scenes);

  const { error: nextError } = await supabase
    .from("pipeline_stages")
    .update({
      status: "awaiting_review",
      output: { ...preview, generatedAt: new Date().toISOString() },
    })
    .eq("id", next.id);
  if (nextError) return { ok: false, error: nextError.message };

  const { error: runError } = await supabase
    .from("pipeline_runs")
    .update({ current_stage: next.stage, status: "running" })
    .eq("id", run.id);
  if (runError) return { ok: false, error: runError.message };

  revalidate();
  return { ok: true };
}

export async function rejectStage(
  stageId: string,
  reason: string
): Promise<ActionResult> {
  const supabase = createAdminClient();

  const stage = await loadStage(supabase, stageId);
  if (!stage) return { ok: false, error: "Stage not found." };

  const { error: stageError } = await supabase
    .from("pipeline_stages")
    .update({ status: "rejected", last_error: reason || "Rejected by reviewer." })
    .eq("id", stageId);
  if (stageError) return { ok: false, error: stageError.message };

  const { error: runError } = await supabase
    .from("pipeline_runs")
    .update({ status: "paused" })
    .eq("id", stage.run_id);
  if (runError) return { ok: false, error: runError.message };

  revalidate();
  return { ok: true };
}

export async function regenerateStage(stageId: string): Promise<ActionResult> {
  const supabase = createAdminClient();

  const stage = await loadStage(supabase, stageId);
  if (!stage) return { ok: false, error: "Stage not found." };

  if (isPaidStage(stage.stage)) {
    return { ok: false, error: PAID_GUARD_MESSAGE };
  }

  const { count } = await supabase
    .from("stage_versions")
    .select("id", { count: "exact", head: true })
    .eq("stage_id", stageId);
  const newVersion = (count ?? 0) + 1;

  if (stage.output) {
    const { error: versionError } = await supabase.from("stage_versions").insert({
      stage_id: stageId,
      version: newVersion,
      output: stage.output,
      cost_usd: stage.cost_usd,
      model: stage.model,
    });
    if (versionError) return { ok: false, error: versionError.message };
  }

  const run = await loadRun(supabase, stage.run_id);
  const { story, scenes } = await loadStoryAndScenes(
    supabase,
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
    .eq("id", stageId);
  if (updateError) return { ok: false, error: updateError.message };

  revalidate();
  return { ok: true };
}

export async function editStage(
  stageId: string,
  outputText: string
): Promise<ActionResult> {
  const supabase = createAdminClient();

  const stage = await loadStage(supabase, stageId);
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
    .eq("id", stageId);
  if (error) return { ok: false, error: error.message };

  revalidate();
  return { ok: true };
}

export async function rollbackToStage(
  runId: string,
  seq: number
): Promise<ActionResult> {
  const supabase = createAdminClient();

  const { error: resetError } = await supabase
    .from("pipeline_stages")
    .update({ status: "pending", output: null, approved_at: null })
    .eq("run_id", runId)
    .gt("seq", seq);
  if (resetError) return { ok: false, error: resetError.message };

  const { data: target } = await supabase
    .from("pipeline_stages")
    .select("*")
    .eq("run_id", runId)
    .eq("seq", seq)
    .maybeSingle<PipelineStageRow>();
  if (!target) return { ok: false, error: "Target stage not found." };

  if (isPaidStage(target.stage)) {
    const { error: runError } = await supabase
      .from("pipeline_runs")
      .update({ current_stage: target.stage, status: "awaiting_payment" })
      .eq("id", runId);
    if (runError) return { ok: false, error: runError.message };
    revalidate();
    return { ok: true };
  }

  const run = await loadRun(supabase, runId);
  const { story, scenes } = await loadStoryAndScenes(
    supabase,
    run?.story_id ?? null
  );
  const preview = getStagePreview(target.stage, story, scenes);

  const { error: targetError } = await supabase
    .from("pipeline_stages")
    .update({
      status: "awaiting_review",
      output: { ...preview, generatedAt: new Date().toISOString() },
    })
    .eq("id", target.id);
  if (targetError) return { ok: false, error: targetError.message };

  const { error: runError } = await supabase
    .from("pipeline_runs")
    .update({ current_stage: target.stage, status: "running" })
    .eq("id", runId);
  if (runError) return { ok: false, error: runError.message };

  revalidate();
  return { ok: true };
}

export async function retryStage(stageId: string): Promise<ActionResult> {
  const supabase = createAdminClient();

  const stage = await loadStage(supabase, stageId);
  if (!stage) return { ok: false, error: "Stage not found." };

  if (isPaidStage(stage.stage)) {
    return { ok: false, error: PAID_GUARD_MESSAGE };
  }

  const { error } = await supabase
    .from("pipeline_stages")
    .update({ status: "awaiting_review", attempts: (stage.attempts ?? 0) + 1 })
    .eq("id", stageId);
  if (error) return { ok: false, error: error.message };

  revalidate();
  return { ok: true };
}

export async function pauseRun(runId: string): Promise<ActionResult> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("pipeline_runs")
    .update({ status: "paused" })
    .eq("id", runId);
  if (error) return { ok: false, error: error.message };

  revalidate();
  return { ok: true };
}

export async function resumeRun(runId: string): Promise<ActionResult> {
  const supabase = createAdminClient();

  const run = await loadRun(supabase, runId);
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
    .eq("id", runId);
  if (error) return { ok: false, error: error.message };

  revalidate();
  return { ok: true };
}
