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

/**
 * Platform-wide STOP (M15 O4). Distinct from maintenance mode: maintenance is
 * about availability of the UI, this halts automated ADVANCEMENT everywhere —
 * the approval layer refuses to advance any run in any workspace while it is on.
 * Recorded as an immutable Global Config version, so who set it and why is
 * permanently answerable.
 */
export async function setPlatformStopAction(
  stopped: boolean,
  reason: string
): Promise<ActionResult> {
  const profile = await requireSuperAdmin();
  const text = reason.trim();
  if (stopped && !text) {
    return { ok: false, error: "Say why you're stopping the platform — it goes on the record." };
  }

  const supabase = await createClient();
  const { setPlatformStop } = await import("@/lib/ops/platform-stop");
  const result = await setPlatformStop(
    supabase,
    stopped,
    profile.user_id,
    text || "Stop lifted."
  );
  if (!result.ok) return result;

  await writeAuditLog({
    actorId: profile.user_id,
    action: stopped ? "platform.stop" : "platform.resume",
    targetType: "platform",
    targetId: "global",
  });

  revalidatePath("/admin/maintenance");
  revalidatePath("/admin");
  return { ok: true };
}
