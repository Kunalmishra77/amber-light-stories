import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Stage version history (M15 O1 — ADR-082). Human edits NEVER overwrite: every
 * edit appends an immutable version and moves the stage's active pointer.
 *
 * Fixes a real data-integrity defect found in the M15 audit — `editStage`
 * previously overwrote `pipeline_stages.output`, destroying the AI output, and
 * `rollbackToStage` set `output = NULL`, destroying content instead of
 * restoring it. `stage_versions` existed but was never written.
 *
 * Sequencing + the active pointer are updated inside `append_stage_version()`
 * under a row lock, so concurrent edits cannot collide or corrupt state.
 */
export type VersionKind = "ai_generated" | "human_edited" | "regenerated" | "restored";

/** Stage payloads are free-form JSON; the version layer never interprets them. */
export type StageOutput = Record<string, unknown> | object | null;

export interface StageVersion {
  id: string;
  stage_id: string;
  version: number;
  output: Record<string, unknown> | null;
  kind: string;
  created_by: string | null;
  source_version_id: string | null;
  note: string | null;
  created_at: string;
}

/**
 * Append a new immutable version and make it active.
 * Returns the created version.
 */
export async function appendStageVersion(
  supabase: SupabaseClient,
  input: {
    stageId: string;
    output: StageOutput;
    kind: VersionKind;
    createdBy?: string | null;
    sourceVersionId?: string | null;
    note?: string | null;
  }
): Promise<StageVersion> {
  const { data, error } = await supabase.rpc("append_stage_version", {
    p_stage_id: input.stageId,
    p_output: input.output,
    p_kind: input.kind,
    p_created_by: input.createdBy ?? null,
    p_source_version_id: input.sourceVersionId ?? null,
    p_note: input.note ?? null,
  });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as StageVersion | undefined;
  if (!row) throw new Error("Version could not be created.");
  return row;
}

/**
 * Ensure the CURRENT output is captured as a version before it is replaced.
 * This is what makes legacy stages (written before M15) safe: their existing
 * AI output is preserved as v1 the first time anyone edits or rolls back.
 * Returns the baseline version, or null when there was nothing to preserve.
 */
export async function ensureBaselineVersion(
  supabase: SupabaseClient,
  stage: { id: string; output: StageOutput; active_version_id?: string | null }
): Promise<StageVersion | null> {
  if (stage.active_version_id) return null;   // already tracked
  if (stage.output === null || stage.output === undefined) return null;  // nothing to preserve

  const { count } = await supabase
    .from("stage_versions")
    .select("id", { count: "exact", head: true })
    .eq("stage_id", stage.id);
  if ((count ?? 0) > 0) return null;

  return appendStageVersion(supabase, {
    stageId: stage.id,
    output: stage.output,
    kind: "ai_generated",
    note: "Baseline captured from existing output (pre-M15 stage)",
  });
}

export async function listStageVersions(
  supabase: SupabaseClient,
  stageId: string
): Promise<StageVersion[]> {
  const { data } = await supabase
    .from("stage_versions")
    .select("id, stage_id, version, output, kind, created_by, source_version_id, note, created_at")
    .eq("stage_id", stageId)
    .order("version", { ascending: false });
  return (data ?? []) as StageVersion[];
}

/**
 * Restore a previous version by APPENDING it as a new `restored` version —
 * history is never rewritten or deleted, and restoring twice is safe.
 */
export async function restoreStageVersion(
  supabase: SupabaseClient,
  input: { stageId: string; versionId: string; restoredBy?: string | null }
): Promise<StageVersion> {
  const { data: target } = await supabase
    .from("stage_versions")
    .select("id, stage_id, version, output")
    .eq("id", input.versionId)
    .eq("stage_id", input.stageId)
    .maybeSingle();
  if (!target) throw new Error("That version does not belong to this stage.");

  return appendStageVersion(supabase, {
    stageId: input.stageId,
    output: (target.output as Record<string, unknown>) ?? null,
    kind: "restored",
    createdBy: input.restoredBy ?? null,
    sourceVersionId: target.id as string,
    note: `Restored from v${target.version}`,
  });
}
