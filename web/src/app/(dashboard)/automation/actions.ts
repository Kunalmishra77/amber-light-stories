"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/auth";
import { denyUnless, PERMISSIONS } from "@/lib/authz";
import { logAudit } from "@/lib/ops/audit";
import { notify } from "@/lib/ops/notify";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

function revalidate() {
  revalidatePath("/automation");
  revalidatePath("/");
}

/** Master on/off switch for automation, stored in `tenant_settings.config.automation_enabled`. */
export async function setAutomationEnabled(enabled: boolean): Promise<ActionResult> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { ok: false, error: "You're not a member of any workspace." };
  if (await denyUnless(PERMISSIONS.scheduleManage, tenantId)) {
    return { ok: false, error: "Only owners or managers can change the automation switch." };
  }

  const supabase = await createClient();

  // Don't let a client switch automation ON before the required setup is done —
  // it would burn schedule slots producing nothing publishable. Turning it OFF
  // is always allowed.
  if (enabled) {
    const { getWorkspaceReadiness } = await import("@/lib/ops/readiness");
    const readiness = await getWorkspaceReadiness(supabase, tenantId);
    if (!readiness.ready) {
      const missing = readiness.steps.filter((s) => s.required && !s.done).map((s) => s.title);
      return {
        ok: false,
        error: `Finish setup first: ${missing.join(", ")}. See "Get set up" on your dashboard.`,
      };
    }
  }

  const { data: settings } = await supabase
    .from("tenant_settings")
    .select("config")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const config = (settings?.config ?? {}) as Record<string, unknown>;

  const { error } = await supabase
    .from("tenant_settings")
    .update({ config: { ...config, automation_enabled: enabled } })
    .eq("tenant_id", tenantId);
  if (error) return { ok: false, error: error.message };

  await logAudit({
    action: "automation.set_enabled",
    target: `tenant_settings:${tenantId}`,
    meta: { enabled },
    tenantId,
  });

  revalidate();
  return { ok: true };
}

/**
 * Emergency stop: immediately sets `schedules.emergency_stop` — the same
 * flag the dashboard and scheduler already read (src/app/(dashboard)/page.tsx,
 * src/app/(dashboard)/schedule/actions.ts) — so this take effect everywhere
 * that flag is honored, not just as a local toggle.
 */
export async function triggerEmergencyStop(): Promise<ActionResult> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { ok: false, error: "You're not a member of any workspace." };
  if (await denyUnless(PERMISSIONS.scheduleManage, tenantId)) {
    return { ok: false, error: "Only owners or managers can trigger an emergency stop." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("schedules")
    .upsert(
      { tenant_id: tenantId, emergency_stop: true, updated_at: new Date().toISOString() },
      { onConflict: "tenant_id" }
    );
  if (error) return { ok: false, error: error.message };

  await logAudit({ action: "automation.emergency_stop", target: `tenant:${tenantId}`, tenantId });
  await notify({
    tenantId,
    kind: "emergency_stop",
    title: "Emergency stop triggered",
    body: "Publishing has been halted for this workspace.",
  });

  revalidate();
  revalidatePath("/schedule");
  return { ok: true };
}

/** Clears the emergency stop, resuming normal scheduled publishing. */
export async function resumeAutomation(): Promise<ActionResult> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { ok: false, error: "You're not a member of any workspace." };
  if (await denyUnless(PERMISSIONS.scheduleManage, tenantId)) {
    return { ok: false, error: "Only owners or managers can resume automation." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("schedules")
    .upsert(
      { tenant_id: tenantId, emergency_stop: false, updated_at: new Date().toISOString() },
      { onConflict: "tenant_id" }
    );
  if (error) return { ok: false, error: error.message };

  await logAudit({ action: "automation.resume", target: `tenant:${tenantId}`, tenantId });

  revalidate();
  revalidatePath("/schedule");
  return { ok: true };
}
