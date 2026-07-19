"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId, getSessionUser, isOwnerOrManager } from "@/lib/auth";
import { logAudit } from "@/lib/ops/audit";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Signs the current user out of every session/device (Supabase's "global"
 * sign-out scope revokes all refresh tokens for the user, not just this
 * browser). The current request's own cookies are also cleared, so the
 * caller should redirect to /login immediately after.
 */
export async function signOutEverywhere(): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "You're not signed in." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "global" });
  if (error) return { ok: false, error: error.message };

  await logAudit({ action: "security.sign_out_everywhere", target: `user:${user.id}` });

  return { ok: true };
}

export interface ExportResult {
  ok: boolean;
  error?: string;
  json?: string;
}

/** Row cap per table in the GDPR export — generous enough for any real
 * tenant, but keeps a single export request bounded. */
const EXPORT_ROW_LIMIT = 2000;

/**
 * GDPR-style "export my data": gathers every row this tenant owns across
 * its core content/config tables into one JSON document. Asset BINARIES are
 * never touched — only the `assets` table's own metadata columns (storage
 * path, kind, cost) are included, never the file bytes themselves.
 *
 * Returns the JSON as a string (rather than a file) so the client component
 * can trigger a browser download without a route handler.
 */
export async function exportTenantDataAction(): Promise<ExportResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "You're not signed in." };

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { ok: false, error: "You're not a member of any workspace." };

  const supabase = await createClient();

  const [stories, scenes, planItems, assets, tenantSettings, subscriptions, usage] = await Promise.all([
    supabase.from("stories").select("*").eq("tenant_id", tenantId).limit(EXPORT_ROW_LIMIT),
    supabase.from("scenes").select("*").eq("tenant_id", tenantId).limit(EXPORT_ROW_LIMIT),
    supabase.from("plan_items").select("*").eq("tenant_id", tenantId).limit(EXPORT_ROW_LIMIT),
    supabase
      .from("assets")
      .select("id, kind, storage_path, meta, cost_usd, version, created_at, story_id, scene_id, character_id")
      .eq("tenant_id", tenantId)
      .limit(EXPORT_ROW_LIMIT),
    supabase.from("tenant_settings").select("*").eq("tenant_id", tenantId).maybeSingle(),
    supabase.from("subscriptions").select("*").eq("tenant_id", tenantId),
    supabase.from("usage_counters").select("*").eq("tenant_id", tenantId),
  ]);

  const firstError = [stories, scenes, planItems, assets, tenantSettings, subscriptions, usage].find(
    (r) => r.error
  )?.error;
  if (firstError) return { ok: false, error: firstError.message };

  const payload = {
    exported_at: new Date().toISOString(),
    tenant_id: tenantId,
    requested_by: user.email ?? user.id,
    data: {
      stories: stories.data ?? [],
      scenes: scenes.data ?? [],
      plan_items: planItems.data ?? [],
      assets_metadata: assets.data ?? [],
      tenant_settings: tenantSettings.data ?? null,
      subscriptions: subscriptions.data ?? [],
      usage: usage.data ?? [],
    },
  };

  await logAudit({
    action: "security.export_data",
    target: `tenant:${tenantId}`,
    meta: { requested_by: user.email ?? user.id },
  });

  return { ok: true, json: JSON.stringify(payload, null, 2) };
}

/**
 * Marks this tenant for a deletion review — NEVER hard-deletes anything.
 * Only owners/managers may request it (it affects the whole workspace, not
 * just the requester). Records the request in `tenant_settings.config`
 * (so it's visible to anyone inspecting the tenant), writes an audit_log
 * entry, and logs a warning event — both of which surface on the
 * super-admin Observability dashboard ("Recent admin activity" / "Event
 * log"), which is how super admins are notified in this app's architecture.
 * A super admin reviews and actions the request manually; nothing here
 * deletes data.
 */
export async function requestAccountDeletionAction(): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "You're not signed in." };

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { ok: false, error: "You're not a member of any workspace." };

  const canRequest = await isOwnerOrManager(tenantId);
  if (!canRequest) {
    return { ok: false, error: "Only workspace owners or managers can request account deletion." };
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("tenant_settings")
    .select("config")
    .eq("tenant_id", tenantId)
    .maybeSingle<{ config: Record<string, unknown> | null }>();

  const nextConfig = {
    ...(existing?.config ?? {}),
    deletion_requested: {
      requested_by: user.id,
      requested_by_email: user.email ?? null,
      requested_at: new Date().toISOString(),
    },
  };

  const { error } = await supabase
    .from("tenant_settings")
    .update({ config: nextConfig })
    .eq("tenant_id", tenantId);
  if (error) return { ok: false, error: error.message };

  await logAudit({
    action: "account.deletion_requested",
    target: `tenant:${tenantId}`,
    meta: { requested_by_email: user.email ?? null },
  });

  try {
    await supabase.from("event_log").insert({
      tenant_id: tenantId,
      level: "warn",
      source: "account",
      message: `Deletion requested by ${user.email ?? user.id}`,
      meta: { requested_by: user.id },
    });
  } catch {
    // Best-effort — the audit_log write above is the durable record.
  }

  return { ok: true };
}
