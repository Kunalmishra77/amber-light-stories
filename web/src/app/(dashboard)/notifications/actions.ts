"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/auth";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

function revalidate() {
  revalidatePath("/notifications");
  revalidatePath("/");
}

export async function markNotificationRead(id: string): Promise<ActionResult> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { ok: false, error: "You're not a member of any workspace." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("id", id)
    .eq("tenant_id", tenantId);
  if (error) return { ok: false, error: error.message };

  revalidate();
  return { ok: true };
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { ok: false, error: "You're not a member of any workspace." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("tenant_id", tenantId)
    .eq("read", false);
  if (error) return { ok: false, error: error.message };

  revalidate();
  return { ok: true };
}
