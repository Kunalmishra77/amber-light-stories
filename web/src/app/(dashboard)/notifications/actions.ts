"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId, getSessionUser } from "@/lib/auth";
import {
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
  type NotificationSeverity,
} from "@/lib/ops/notification-categories";

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

/**
 * Per-user delivery preferences (M15 O5). Preferences are PERSONAL — RLS only
 * lets a member read or write their own row, so one member can never silence
 * another's alerts.
 */
export async function saveNotificationPreference(input: {
  category: string;
  inApp: boolean;
  email: boolean;
  webhook: boolean;
  minSeverity: string;
}): Promise<ActionResult> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { ok: false, error: "You're not a member of any workspace." };
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "You need to be signed in." };

  if (!(NOTIFICATION_CATEGORIES as readonly string[]).includes(input.category)) {
    return { ok: false, error: "Unknown notification category." };
  }
  if (!["info", "warning", "critical"].includes(input.minSeverity)) {
    return { ok: false, error: "Unknown severity." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("notification_preferences").upsert(
    {
      tenant_id: tenantId,
      user_id: user.id,
      category: input.category as NotificationCategory,
      in_app: input.inApp,
      email: input.email,
      webhook: input.webhook,
      min_severity: input.minSeverity as NotificationSeverity,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,user_id,category" }
  );
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
