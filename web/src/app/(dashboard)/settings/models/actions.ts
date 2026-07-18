"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/auth";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

function required(formData: FormData, key: string): string | null {
  const raw = (formData.get(key) as string | null) ?? "";
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Updates the `settings` row with kind='model_routing'. Purely a config
 * write — swapping which model string is used per tier changes generation
 * with zero code changes, and the cost governor still enforces the
 * per-video budget cap regardless of which models are configured here.
 */
export async function updateModelRouting(formData: FormData): Promise<ActionResult> {
  const fields = {
    image_high: required(formData, "image_high"),
    image_medium: required(formData, "image_medium"),
    image_low: required(formData, "image_low"),
    motion_premium: required(formData, "motion_premium"),
    motion_standard: required(formData, "motion_standard"),
    motion_cheap: required(formData, "motion_cheap"),
    thumbnail: required(formData, "thumbnail"),
  };

  for (const [key, value] of Object.entries(fields)) {
    if (!value) {
      return { ok: false, error: `"${key.replace(/_/g, " ")}" cannot be empty.` };
    }
  }

  const value = {
    image: {
      High: fields.image_high,
      Medium: fields.image_medium,
      Low: fields.image_low,
    },
    motion: {
      premium: fields.motion_premium,
      standard: fields.motion_standard,
      cheap: fields.motion_cheap,
    },
    thumbnail: fields.thumbnail,
  };

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { ok: false, error: "You're not a member of any workspace." };

  const supabase = await createClient();

  const { data: existing, error: findError } = await supabase
    .from("settings")
    .select("id")
    .eq("kind", "model_routing")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (findError) return { ok: false, error: findError.message };

  if (existing) {
    const { error } = await supabase
      .from("settings")
      .update({ value, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .eq("tenant_id", tenantId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("tenant_id", tenantId)
      .limit(1)
      .maybeSingle();

    const { error } = await supabase.from("settings").insert({
      tenant_id: tenantId,
      project_id: project?.id ?? null,
      kind: "model_routing",
      value,
    });
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/settings/models");
  return { ok: true };
}
