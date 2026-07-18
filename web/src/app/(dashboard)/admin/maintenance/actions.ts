"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/admin/guard";
import { writeAuditLog } from "@/lib/admin/audit";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export async function updateMaintenanceAction(formData: FormData): Promise<ActionResult> {
  const profile = await requireSuperAdmin();

  const enabled = formData.get("enabled") === "on";
  const message = ((formData.get("message") as string | null) ?? "").trim();

  const supabase = await createClient();
  const { error } = await supabase
    .from("maintenance")
    .update({
      enabled,
      message: message || null,
      updated_by: profile.user_id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);

  if (error) return { ok: false, error: error.message };

  await writeAuditLog({
    actorId: profile.user_id,
    action: enabled ? "maintenance.enable" : "maintenance.disable",
    targetType: "maintenance",
    targetId: "1",
  });

  revalidatePath("/admin/maintenance");
  revalidatePath("/admin");
  return { ok: true };
}
