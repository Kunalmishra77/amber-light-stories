"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/admin/guard";
import { writeAuditLog } from "@/lib/admin/audit";

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
 * Updates the GLOBAL `settings` row (tenant_id IS NULL, kind='model_routing')
 * that per-tenant routing falls back to when a tenant hasn't overridden it.
 */
export async function updateGlobalRoutingAction(formData: FormData): Promise<ActionResult> {
  const profile = await requireSuperAdmin();

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

  const supabase = await createClient();

  const { data: existing, error: findError } = await supabase
    .from("settings")
    .select("id")
    .eq("kind", "model_routing")
    .is("tenant_id", null)
    .maybeSingle();

  if (findError) return { ok: false, error: findError.message };

  if (existing) {
    const { error } = await supabase
      .from("settings")
      .update({ value, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("settings").insert({
      tenant_id: null,
      kind: "model_routing",
      value,
    });
    if (error) return { ok: false, error: error.message };
  }

  await writeAuditLog({
    actorId: profile.user_id,
    action: "routing.update_global",
    targetType: "settings",
    targetId: "global_model_routing",
  });

  revalidatePath("/admin/routing");
  return { ok: true };
}
