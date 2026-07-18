"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/admin/guard";
import { writeAuditLog } from "@/lib/admin/audit";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/** Flips a feature flag's `enabled` bit. */
export async function toggleFlagAction(flagId: string, nextEnabled: boolean): Promise<ActionResult> {
  const profile = await requireSuperAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("feature_flags")
    .update({ enabled: nextEnabled })
    .eq("id", flagId);

  if (error) return { ok: false, error: error.message };

  await writeAuditLog({
    actorId: profile.user_id,
    action: nextEnabled ? "flag.enable" : "flag.disable",
    targetType: "feature_flag",
    targetId: flagId,
  });

  revalidatePath("/admin/flags");
  return { ok: true };
}

/** Creates a feature flag — global (tenant_id null) or scoped to one tenant. */
export async function createFlagAction(formData: FormData): Promise<ActionResult> {
  const profile = await requireSuperAdmin();

  const key = ((formData.get("key") as string | null) ?? "").trim();
  if (!key) return { ok: false, error: "Flag key is required." };

  const scope = (formData.get("scope") as string | null) ?? "global";
  const tenantId = scope === "tenant" ? (formData.get("tenant_id") as string | null) : null;
  if (scope === "tenant" && !tenantId) {
    return { ok: false, error: "Choose a tenant for a tenant-scoped flag." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("feature_flags")
    .insert({ key, tenant_id: tenantId, enabled: false, config: {} })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  await writeAuditLog({
    actorId: profile.user_id,
    action: "flag.create",
    targetType: "feature_flag",
    targetId: data.id as string,
    tenantId,
    meta: { key, scope },
  });

  revalidatePath("/admin/flags");
  return { ok: true };
}
