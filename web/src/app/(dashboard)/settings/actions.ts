"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/auth";
import { logAudit } from "@/lib/ops/audit";
import { STAGE_ORDER } from "@/lib/pipeline/stage-content";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const AUTO_APPROVE_STAGES = STAGE_ORDER.filter(
  (stage) => !["human_review", "schedule", "publish"].includes(stage)
);

const VALID_LANGUAGES = new Set(["en", "hi"]);
const VALID_ASPECTS = new Set(["9:16", "16:9", "1:1"]);

/**
 * Updates the single `projects` row: general production settings plus the
 * per-stage auto-approve matrix, both submitted together from one form.
 */
export async function updateProjectSettings(formData: FormData): Promise<ActionResult> {
  const id = (formData.get("id") as string | null) ?? "";
  if (!id) return { ok: false, error: "Missing project id." };

  const budgetRaw = (formData.get("per_video_budget_usd") as string | null) ?? "";
  const budget = Number(budgetRaw);
  if (!Number.isFinite(budget) || budget <= 0) {
    return { ok: false, error: "Budget must be a positive number." };
  }

  const language = (formData.get("language") as string | null) ?? "";
  if (!VALID_LANGUAGES.has(language)) {
    return { ok: false, error: "Choose a supported language." };
  }

  const targetSecondsRaw = (formData.get("target_seconds") as string | null) ?? "";
  const targetSeconds = Number(targetSecondsRaw);
  if (!Number.isInteger(targetSeconds) || targetSeconds <= 0) {
    return { ok: false, error: "Target seconds must be a positive whole number." };
  }

  const aspectRatio = (formData.get("aspect_ratio") as string | null) ?? "";
  if (!VALID_ASPECTS.has(aspectRatio)) {
    return { ok: false, error: "Choose a supported aspect ratio." };
  }

  const niche = ((formData.get("niche") as string | null) ?? "").trim();

  const autoApprove: Record<string, boolean> = {};
  for (const stage of AUTO_APPROVE_STAGES) {
    autoApprove[stage] = formData.get(`auto_${stage}`) === "on";
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { ok: false, error: "You're not a member of any workspace." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({
      per_video_budget_usd: budget,
      language,
      target_seconds: targetSeconds,
      aspect_ratio: aspectRatio,
      niche: niche || null,
      auto_approve: autoApprove,
    })
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) return { ok: false, error: error.message };

  await logAudit({
    action: "settings.update_project",
    target: `project:${id}`,
    meta: { language, aspect_ratio: aspectRatio, target_seconds: targetSeconds },
    tenantId,
  });

  revalidatePath("/settings");
  return { ok: true };
}
