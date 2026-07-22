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
import { getSessionUser } from "@/lib/auth";
import {
  evaluateApproval,
  type ApprovalIntent,
  type ApprovalOutcome,
} from "@/lib/approval/decision";
import {
  appendStageVersion,
  ensureBaselineVersion,
  restoreStageVersion,
} from "@/lib/pipeline/versioning";

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

/** Resolves the authed client + active tenant + actor, or a ready-made error. */
async function requireContext(): Promise<
  { supabase: Supabase; tenantId: string; userId: string | null } | { error: ActionResult }
> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) {
    return { error: { ok: false, error: "You're not a member of any workspace." } };
  }
  const supabase = await createClient();
  const user = await getSessionUser();
  return { supabase, tenantId, userId: user?.id ?? null };
}

/**
 * The M15 O2 gate. EVERY path in this file that changes pipeline state runs
 * through here, so a compliance block, an exhausted budget or an emergency stop
 * cannot be walked past by choosing a different button. Each call also writes an
 * append-only decision record with its evidence.
 *
 * Uses the caller's authed client so the decision is written under RLS and
 * attributed to the real actor — never a service-role escalation.
 */
async function gate(input: {
  supabase: Supabase;
  tenantId: string;
  userId: string | null;
  runId: string | null;
  stageId: string | null;
  stageName: string;
  intent: ApprovalIntent;
  recordAs?: "rejected";
}): Promise<{ ok: true; outcome: ApprovalOutcome } | { ok: false; error: string }> {
  let outcome: ApprovalOutcome;
  try {
    outcome = await evaluateApproval({
      tenantId: input.tenantId,
      runId: input.runId,
      stageId: input.stageId,
      stageName: input.stageName,
      actorId: input.userId,
      isAutomation: false,
      intent: input.intent,
      recordAs: input.recordAs,
      client: input.supabase as unknown as Parameters<typeof evaluateApproval>[0]["client"],
    });
  } catch (err) {
    // Fail CLOSED: if the safety layer can't be consulted, don't advance.
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't evaluate approval safety checks.",
    };
  }
  if (!outcome.allowed) {
    return { ok: false, error: outcome.reasons.join(" ") };
  }
  return { ok: true, outcome };
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
  const { supabase, tenantId, userId } = ctx;

  const stage = await loadStage(supabase, tenantId, stageId);
  if (!stage) return { ok: false, error: "Stage not found." };

  if (isPaidStage(stage.stage)) {
    return { ok: false, error: PAID_GUARD_MESSAGE };
  }

  // Publishing the run needs a connected channel — fail fast BEFORE marking the
  // terminal stage done, so the customer can connect one and re-approve. This
  // runs ahead of the approval gate so a missing channel doesn't leave an
  // "approved" decision on the record for work that never happened.
  if (stage.stage === "publish") {
    try {
      const { getPublishingTarget } = await import("@/lib/providers/publishing");
      const target = await getPublishingTarget(tenantId, "youtube");
      if (!target) return { ok: false, error: new PublishTargetMissingError().message };
    } catch {
      // Resolver failure shouldn't hard-block; publishRun re-checks below.
    }
  }

  // M15 O2 — the safety verdicts M12 already computes are now ENFORCED here.
  // Before this, `quality_scores.action` and `compliance_checks.status` were
  // written but never read, so "blocked" blocked nothing.
  const decision = await gate({
    supabase,
    tenantId,
    userId,
    runId: stage.run_id,
    stageId,
    stageName: stage.stage,
    intent: "advance",
  });
  if (!decision.ok) return { ok: false, error: decision.error };

  // Freeze exactly what was approved. Legacy stages created before M15 have no
  // versions at all; this captures their current output as v1 so the approval
  // record points at real, immutable content.
  await ensureBaselineVersion(supabase, stage);

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
    meta: {
      stage: stage.stage,
      run_id: stage.run_id,
      decision: decision.outcome.decision,
      mode: decision.outcome.mode,
      policy_version: decision.outcome.policyVersion,
    },
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

  // Generated output enters history as v1 of the next stage, so the reviewer's
  // later edits always have an AI baseline to diff against.
  try {
    await appendStageVersion(supabase, {
      stageId: next.id,
      output: { ...preview, generatedAt: new Date().toISOString() },
      kind: "ai_generated",
      note: `Generated when ${stageLabel(stage.stage)} was approved`,
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't prepare the next stage.",
    };
  }

  const { error: nextError } = await supabase
    .from("pipeline_stages")
    .update({
      status: "awaiting_review",
      // Starts the review SLA clock the moment the work becomes reviewable.
      review_due_at: new Date(Date.now() + 24 * 3_600_000).toISOString(),
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
    category: "review",
    title: `Awaiting review: ${stageLabel(next.stage)}`,
    body: story.topic ? `"${story.topic}" is ready for your review.` : undefined,
    link: `/review/${next.id}`,
    entityType: "pipeline_stage",
    entityId: next.id,
    dedupeKey: `review:${next.id}`,
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
  const { supabase, tenantId, userId } = ctx;

  const stage = await loadStage(supabase, tenantId, stageId);
  if (!stage) return { ok: false, error: "Stage not found." };

  // Rejection is the safe direction and is never refused — but it is still
  // recorded as a decision WITH its evidence, because the O2 invariant covers
  // every decision, not only approvals.
  await gate({
    supabase,
    tenantId,
    userId,
    runId: stage.run_id,
    stageId,
    stageName: stage.stage,
    intent: "remediate",
    recordAs: "rejected",
  });

  // Preserve whatever is being rejected — rejecting must not lose the content.
  await ensureBaselineVersion(supabase, stage);

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
    category: "approval",
    severity: "warning",
    title: `Stage rejected: ${stageLabel(stage.stage)}`,
    body: reason || undefined,
    link: `/review/${stageId}`,
    entityType: "pipeline_stage",
    entityId: stageId,
  });

  revalidate();
  return { ok: true };
}

export async function regenerateStage(stageId: string): Promise<ActionResult> {
  const ctx = await requireContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, tenantId, userId } = ctx;

  const stage = await loadStage(supabase, tenantId, stageId);
  if (!stage) return { ok: false, error: "Stage not found." };

  if (isPaidStage(stage.stage)) {
    return { ok: false, error: PAID_GUARD_MESSAGE };
  }

  // Regeneration spends money, so the cost governor and emergency stop still
  // apply — but a compliance/quality failure must NOT block the action that
  // repairs it, or a blocked run could never be recovered.
  const decision = await gate({
    supabase,
    tenantId,
    userId,
    runId: stage.run_id,
    stageId,
    stageName: stage.stage,
    intent: "remediate",
  });
  if (!decision.ok) return { ok: false, error: decision.error };

  // Preserve the output being replaced. Previously this wrote stage_versions
  // with a racy `count + 1` sequence; `append_stage_version` computes the next
  // version under a row lock instead, so concurrent regenerations can't collide.
  await ensureBaselineVersion(supabase, stage);

  const run = await loadRun(supabase, tenantId, stage.run_id);
  const { story, scenes } = await loadStoryAndScenes(
    supabase,
    tenantId,
    run?.story_id ?? null
  );
  const fresh = getStagePreview(stage.stage, story, scenes);

  let version: number;
  try {
    const appended = await appendStageVersion(supabase, {
      stageId,
      output: { ...fresh, generatedAt: new Date().toISOString() },
      kind: "regenerated",
      createdBy: userId,
      note: "Regenerated by reviewer",
    });
    version = appended.version;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't record the regenerated version.",
    };
  }

  const { error: updateError } = await supabase
    .from("pipeline_stages")
    .update({
      status: "awaiting_review",
      attempts: (stage.attempts ?? 0) + 1,
    })
    .eq("id", stageId)
    .eq("tenant_id", tenantId);
  if (updateError) return { ok: false, error: updateError.message };

  await logAudit({
    action: "pipeline.regenerate_stage",
    target: `pipeline_stage:${stageId}`,
    meta: { stage: stage.stage, version },
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
  const { supabase, tenantId, userId } = ctx;

  const stage = await loadStage(supabase, tenantId, stageId);
  if (!stage) return { ok: false, error: "Stage not found." };

  const decision = await gate({
    supabase,
    tenantId,
    userId,
    runId: stage.run_id,
    stageId,
    stageName: stage.stage,
    intent: "remediate",
  });
  if (!decision.ok) return { ok: false, error: decision.error };

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

  // M15 O1 — this used to `.update({ output })`, silently destroying the AI
  // output the human was editing. Now the prior output is preserved as a
  // version first, and the edit is APPENDED as an immutable `human_edited`
  // version which the RPC makes active in the same transaction.
  const baseline = await ensureBaselineVersion(supabase, stage);
  try {
    await appendStageVersion(supabase, {
      stageId,
      output,
      kind: "human_edited",
      createdBy: userId,
      sourceVersionId: baseline?.id ?? stage.active_version_id ?? null,
      note: "Edited in the review screen",
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't save the edit.",
    };
  }

  await logAudit({
    action: "pipeline.edit_stage",
    target: `pipeline_stage:${stageId}`,
    meta: { stage: stage.stage, run_id: stage.run_id, chars: trimmed.length },
    tenantId,
  });

  revalidate();
  return { ok: true };
}

export async function rollbackToStage(
  runId: string,
  seq: number
): Promise<ActionResult> {
  const ctx = await requireContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, tenantId, userId } = ctx;

  const { data: target } = await supabase
    .from("pipeline_stages")
    .select("*")
    .eq("run_id", runId)
    .eq("seq", seq)
    .eq("tenant_id", tenantId)
    .maybeSingle<PipelineStageRow>();
  if (!target) return { ok: false, error: "Target stage not found." };

  const decision = await gate({
    supabase,
    tenantId,
    userId,
    runId,
    stageId: target.id,
    stageName: target.stage,
    intent: "remediate",
  });
  if (!decision.ok) return { ok: false, error: decision.error };

  // M15 O1 — rolling back used to set `output = null` on every downstream
  // stage, permanently destroying generated content. Each stage's output is now
  // captured as a version FIRST, so the work is recoverable from history even
  // though the live pointer is cleared for regeneration.
  const { data: downstream } = await supabase
    .from("pipeline_stages")
    .select("*")
    .eq("run_id", runId)
    .eq("tenant_id", tenantId)
    .gt("seq", seq)
    .order("seq", { ascending: true });

  for (const st of (downstream ?? []) as PipelineStageRow[]) {
    if (!st.output) continue;
    try {
      await ensureBaselineVersion(supabase, st);
    } catch {
      // Preserving history must never make the rollback itself fail; the stage
      // simply keeps its output until the next edit captures it.
    }
  }

  const { error: resetError } = await supabase
    .from("pipeline_stages")
    .update({ status: "pending", output: null, active_version_id: null, approved_at: null })
    .eq("run_id", runId)
    .eq("tenant_id", tenantId)
    .gt("seq", seq);
  if (resetError) return { ok: false, error: resetError.message };

  await logAudit({
    action: "pipeline.rollback",
    target: `pipeline_run:${runId}`,
    meta: {
      seq,
      stage: target.stage,
      preserved_stages: (downstream ?? []).filter((s) => s.output).length,
    },
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

  // Restore the target stage from HISTORY where history exists. Only a stage
  // that has never produced anything falls back to a fresh preview — a rollback
  // must return you to real previous work, not to a blank regeneration.
  await ensureBaselineVersion(supabase, target);
  const { data: latest } = await supabase
    .from("stage_versions")
    .select("id, version")
    .eq("stage_id", target.id)
    .eq("tenant_id", tenantId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; version: number }>();

  if (latest) {
    try {
      await restoreStageVersion(supabase, {
        stageId: target.id,
        versionId: latest.id,
        restoredBy: userId,
      });
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Couldn't restore that version.",
      };
    }
  } else {
    const run = await loadRun(supabase, tenantId, runId);
    const { story, scenes } = await loadStoryAndScenes(
      supabase,
      tenantId,
      run?.story_id ?? null
    );
    const preview = getStagePreview(target.stage, story, scenes);
    try {
      await appendStageVersion(supabase, {
        stageId: target.id,
        output: { ...preview, generatedAt: new Date().toISOString() },
        kind: "ai_generated",
        createdBy: userId,
        note: "Regenerated on rollback (stage had no prior output)",
      });
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Couldn't prepare the stage.",
      };
    }
  }

  const { error: targetError } = await supabase
    .from("pipeline_stages")
    .update({ status: "awaiting_review", approved_at: null })
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
  const { supabase, tenantId, userId } = ctx;

  const stage = await loadStage(supabase, tenantId, stageId);
  if (!stage) return { ok: false, error: "Stage not found." };

  if (isPaidStage(stage.stage)) {
    return { ok: false, error: PAID_GUARD_MESSAGE };
  }

  // Retry re-runs execution, so it is an ADVANCE, not a repair: a compliance
  // block or an exhausted budget must stop it exactly like an approval.
  const decision = await gate({
    supabase,
    tenantId,
    userId,
    runId: stage.run_id,
    stageId,
    stageName: stage.stage,
    intent: "advance",
  });
  if (!decision.ok) return { ok: false, error: decision.error };

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

  // Pausing is always allowed — stopping is never the unsafe direction.
  const { error } = await supabase
    .from("pipeline_runs")
    .update({ status: "paused" })
    .eq("id", runId)
    .eq("tenant_id", tenantId);
  if (error) return { ok: false, error: error.message };

  await logAudit({
    action: "pipeline.pause_run",
    target: `pipeline_run:${runId}`,
    meta: {},
    tenantId,
  });

  revalidate();
  return { ok: true };
}

export async function resumeRun(runId: string): Promise<ActionResult> {
  const ctx = await requireContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, tenantId, userId } = ctx;

  const run = await loadRun(supabase, tenantId, runId);
  if (!run) return { ok: false, error: "Run not found." };

  if (run.status === "awaiting_payment") {
    return {
      ok: false,
      error:
        "This run is parked at a paid-stage gate. Unlocking it requires Phase 5 paid-run permission, not a resume.",
    };
  }

  // Resuming restarts execution, so it must clear the same bar as an approval.
  // `runPaused` is deliberately not consulted here — the run being paused is the
  // precondition for resuming it, not a reason to refuse.
  const decision = await gate({
    supabase,
    tenantId,
    userId,
    runId,
    stageId: null,
    stageName: run.current_stage ?? "run",
    intent: "advance",
  });
  if (!decision.ok && !/is paused/i.test(decision.error)) {
    return { ok: false, error: decision.error };
  }

  const { error } = await supabase
    .from("pipeline_runs")
    .update({ status: "running" })
    .eq("id", runId)
    .eq("tenant_id", tenantId);
  if (error) return { ok: false, error: error.message };

  await logAudit({
    action: "pipeline.resume_run",
    target: `pipeline_run:${runId}`,
    meta: { stage: run.current_stage },
    tenantId,
  });

  revalidate();
  return { ok: true };
}
