"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { authorize, PERMISSIONS, type PermissionKey } from "@/lib/authz";
import { logAudit } from "@/lib/ops/audit";
import { notifyUsers } from "@/lib/ops/notify";
import { restoreStageVersion } from "@/lib/pipeline/versioning";
import { addComment } from "@/lib/collab/comments";
import { approveStage, rejectStage, type ActionResult } from "../pipeline/actions";

export type { ActionResult };

/**
 * Resolves the workspace AND enforces the permission for the action about to
 * run. Previously this checked membership only, so a viewer could bulk-approve
 * up to 50 stages from the Review Center.
 */
async function ctx(permission: PermissionKey) {
  const auth = await authorize(permission);
  if (!auth.ok) return { error: auth.error };
  const supabase = await createClient();
  return { supabase, tenantId: auth.tenantId, userId: auth.userId };
}

function revalidate(stageId?: string) {
  revalidatePath("/review");
  revalidatePath("/pipeline");
  if (stageId) revalidatePath(`/review/${stageId}`);
}

/** Claim an item, or hand it to a colleague. */
export async function assignReview(
  stageId: string,
  assigneeId: string | null
): Promise<ActionResult> {
  const c = await ctx(PERMISSIONS.contentApprove);
  if ("error" in c) return { ok: false, error: c.error };

  // The assignee must actually belong to this workspace. Without this an
  // arbitrary user id could be written to `assigned_to` and then notified,
  // turning review assignment into a way to message any user of the platform.
  if (assigneeId) {
    const { data: member } = await c.supabase
      .from("memberships")
      .select("user_id")
      .eq("tenant_id", c.tenantId)
      .eq("user_id", assigneeId)
      .eq("status", "active")
      .maybeSingle<{ user_id: string }>();
    if (!member) return { ok: false, error: "That person isn't a member of this workspace." };
  }

  const { error } = await c.supabase
    .from("pipeline_stages")
    .update({
      assigned_to: assigneeId,
      assigned_at: assigneeId ? new Date().toISOString() : null,
      assigned_by: assigneeId ? c.userId : null,
    })
    .eq("id", stageId)
    .eq("tenant_id", c.tenantId)
    .eq("status", "awaiting_review");
  if (error) return { ok: false, error: error.message };

  await logAudit({
    action: "review.assign",
    target: `pipeline_stage:${stageId}`,
    meta: { assignee: assigneeId },
    tenantId: c.tenantId,
  });

  if (assigneeId && assigneeId !== c.userId) {
    await notifyUsers(c.tenantId, [assigneeId], {
      kind: "review_assigned",
      category: "review",
      title: "A review was assigned to you",
      link: `/review/${stageId}`,
      entityType: "pipeline_stage",
      entityId: stageId,
      dedupeKey: `review_assigned:${stageId}:${assigneeId}`,
    });
  }

  revalidate(stageId);
  return { ok: true };
}

/** Explicit human override of queue order. 0 = most urgent. */
export async function setReviewPriority(stageId: string, priority: number): Promise<ActionResult> {
  const c = await ctx(PERMISSIONS.contentApprove);
  if ("error" in c) return { ok: false, error: c.error };
  const clamped = Math.max(0, Math.min(100, Math.round(priority)));

  const { error } = await c.supabase
    .from("pipeline_stages")
    .update({ review_priority: clamped })
    .eq("id", stageId)
    .eq("tenant_id", c.tenantId);
  if (error) return { ok: false, error: error.message };

  revalidate(stageId);
  return { ok: true };
}

/** Records when a reviewer opened an item — the denominator for review latency. */
export async function markReviewStarted(stageId: string): Promise<ActionResult> {
  const c = await ctx(PERMISSIONS.contentView);
  if ("error" in c) return { ok: false, error: c.error };

  await c.supabase
    .from("pipeline_stages")
    .update({ review_started_at: new Date().toISOString() })
    .eq("id", stageId)
    .eq("tenant_id", c.tenantId)
    .is("review_started_at", null);

  return { ok: true };
}

export interface BulkResult {
  ok: boolean;
  approved: number;
  failed: { stageId: string; error: string }[];
}

/**
 * Bulk approve. Each item is approved through the SAME gated `approveStage`
 * path as a single approval — bulk is a convenience, never a way to skip the
 * safety layer. Items that are refused are reported individually rather than
 * failing the whole batch.
 */
export async function bulkApprove(stageIds: string[]): Promise<BulkResult> {
  const result: BulkResult = { ok: true, approved: 0, failed: [] };
  for (const id of stageIds.slice(0, 50)) {
    const r = await approveStage(id);
    if (r.ok) result.approved++;
    else result.failed.push({ stageId: id, error: r.error ?? "Refused." });
  }
  result.ok = result.failed.length === 0;
  revalidate();
  return result;
}

export async function bulkReject(stageIds: string[], reason: string): Promise<BulkResult> {
  const result: BulkResult = { ok: true, approved: 0, failed: [] };
  for (const id of stageIds.slice(0, 50)) {
    const r = await rejectStage(id, reason);
    if (r.ok) result.approved++;
    else result.failed.push({ stageId: id, error: r.error ?? "Refused." });
  }
  result.ok = result.failed.length === 0;
  revalidate();
  return result;
}

/** Restore a previous version — appended as a new version, never a rewrite. */
export async function restoreVersion(stageId: string, versionId: string): Promise<ActionResult> {
  const c = await ctx(PERMISSIONS.contentEdit);
  if ("error" in c) return { ok: false, error: c.error };

  try {
    const restored = await restoreStageVersion(c.supabase, {
      stageId,
      versionId,
      restoredBy: c.userId,
    });
    await logAudit({
      action: "review.restore_version",
      target: `pipeline_stage:${stageId}`,
      meta: { restored_as: restored.version, source_version_id: versionId },
      tenantId: c.tenantId,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't restore that version." };
  }

  revalidate(stageId);
  return { ok: true };
}

export async function postComment(stageId: string, body: string): Promise<ActionResult> {
  const c = await ctx(PERMISSIONS.contentView);
  if ("error" in c) return { ok: false, error: c.error };
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "Write something first." };

  try {
    await addComment(c.supabase, {
      tenantId: c.tenantId,
      entityType: "pipeline_stage",
      entityId: stageId,
      body: trimmed,
      authorId: c.userId,
      link: `/review/${stageId}`,
      context: "a review item",
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't post the comment." };
  }

  revalidate(stageId);
  return { ok: true };
}
