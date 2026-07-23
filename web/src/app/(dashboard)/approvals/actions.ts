"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/auth";
import { denyUnless, PERMISSIONS } from "@/lib/authz";
import { logAudit } from "@/lib/ops/audit";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

function revalidate() {
  revalidatePath("/approvals");
  revalidatePath("/stories");
  revalidatePath("/");
}

/** Approves a draft story — moves it out of the review queue and into
 * production. Distinct from pipeline stage approval (src/app/(dashboard)/pipeline/actions.ts),
 * which advances a run stage-by-stage; this is the top-level "yes, build this story" call. */
export async function approveDraftStory(storyId: string): Promise<ActionResult> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { ok: false, error: "You're not a member of any workspace." };

  const denied = await denyUnless(PERMISSIONS.contentApprove, tenantId);
  if (denied) return { ok: false, error: denied };

  const supabase = await createClient();
  const { error } = await supabase
    .from("stories")
    .update({ status: "approved" })
    .eq("id", storyId)
    .eq("tenant_id", tenantId)
    .eq("status", "draft");
  if (error) return { ok: false, error: error.message };

  await logAudit({ action: "approvals.approve_story", target: `story:${storyId}`, tenantId });

  revalidate();
  return { ok: true };
}

/** Rejects/archives a draft story. */
export async function rejectDraftStory(storyId: string): Promise<ActionResult> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { ok: false, error: "You're not a member of any workspace." };

  const denied = await denyUnless(PERMISSIONS.contentApprove, tenantId);
  if (denied) return { ok: false, error: denied };

  const supabase = await createClient();
  const { error } = await supabase
    .from("stories")
    .update({ status: "archived" })
    .eq("id", storyId)
    .eq("tenant_id", tenantId)
    .eq("status", "draft");
  if (error) return { ok: false, error: error.message };

  await logAudit({ action: "approvals.reject_story", target: `story:${storyId}`, tenantId });

  revalidate();
  return { ok: true };
}
