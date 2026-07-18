"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/admin/guard";
import { writeAuditLog } from "@/lib/admin/audit";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const VALID_AUDIENCES = new Set(["all", "tenants", "internal"]);

export async function createAnnouncementAction(formData: FormData): Promise<ActionResult> {
  const profile = await requireSuperAdmin();

  const title = ((formData.get("title") as string | null) ?? "").trim();
  if (!title) return { ok: false, error: "Title is required." };

  const body = ((formData.get("body") as string | null) ?? "").trim();
  if (!body) return { ok: false, error: "Body is required." };

  const audience = (formData.get("audience") as string | null) ?? "all";
  if (!VALID_AUDIENCES.has(audience)) return { ok: false, error: "Invalid audience." };

  const active = formData.get("active") === "on";

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("announcements")
    .insert({ title, body, audience, active, created_by: profile.user_id })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  await writeAuditLog({
    actorId: profile.user_id,
    action: "announcement.create",
    targetType: "announcement",
    targetId: data.id as string,
    meta: { audience },
  });

  revalidatePath("/admin/announcements");
  return { ok: true };
}

export async function toggleAnnouncementActiveAction(
  id: string,
  nextActive: boolean
): Promise<ActionResult> {
  const profile = await requireSuperAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("announcements")
    .update({ active: nextActive })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  await writeAuditLog({
    actorId: profile.user_id,
    action: nextActive ? "announcement.activate" : "announcement.deactivate",
    targetType: "announcement",
    targetId: id,
  });

  revalidatePath("/admin/announcements");
  return { ok: true };
}
