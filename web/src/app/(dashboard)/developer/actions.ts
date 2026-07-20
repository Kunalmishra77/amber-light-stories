"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId, getSessionUser, isOwnerOrManager } from "@/lib/auth";
import { logAudit } from "@/lib/ops/audit";
import { generateApiKey, generateSigningSecret } from "@/lib/api/keys";
import { API_SCOPES, WEBHOOK_EVENT_TYPES } from "@/lib/api/constants";

export interface ActionResult {
  ok: boolean;
  error?: string;
  /** One-time secret (API token or webhook signing secret), shown once. */
  secret?: string;
}

function revalidate() {
  revalidatePath("/developer");
}

/** Resolve + gate the tenant context. Only owners/managers manage API access. */
async function requireManager(): Promise<
  { tenantId: string; userId: string } | { error: ActionResult }
> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { error: { ok: false, error: "You're not a member of any workspace." } };
  if (!(await isOwnerOrManager(tenantId))) {
    return { error: { ok: false, error: "Only owners or managers can manage API access." } };
  }
  const user = await getSessionUser();
  if (!user) return { error: { ok: false, error: "Not signed in." } };
  return { tenantId, userId: user.id };
}

function parseScopes(formData: FormData): string[] {
  const scopes = formData.getAll("scopes").map((s) => String(s));
  return scopes.filter((s) => (API_SCOPES as readonly string[]).includes(s));
}

/** Issue a new scoped API key. Returns the full token ONCE. */
export async function issueApiKeyAction(formData: FormData): Promise<ActionResult> {
  const ctx = await requireManager();
  if ("error" in ctx) return ctx.error;

  const name = ((formData.get("name") as string | null) ?? "").trim();
  if (!name) return { ok: false, error: "Give the key a name." };
  const scopes = parseScopes(formData);
  if (scopes.length === 0) return { ok: false, error: "Select at least one scope." };

  const { prefix, token, hash } = generateApiKey();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      tenant_id: ctx.tenantId,
      name,
      prefix,
      key_hash: hash,
      scopes,
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  await logAudit({
    action: "api_key.issue",
    target: `api_key:${data.id}`,
    meta: { name, scopes },
    tenantId: ctx.tenantId,
  });
  revalidate();
  return { ok: true, secret: token };
}

/** Rotate a key in place — same name/scopes, brand-new secret. Returns it once. */
export async function rotateApiKeyAction(keyId: string): Promise<ActionResult> {
  const ctx = await requireManager();
  if ("error" in ctx) return ctx.error;

  const { prefix, token, hash } = generateApiKey();
  const supabase = await createClient();
  const { error } = await supabase
    .from("api_keys")
    .update({
      prefix,
      key_hash: hash,
      rotated_at: new Date().toISOString(),
      revoked_at: null,
      last_used_at: null,
    })
    .eq("id", keyId)
    .eq("tenant_id", ctx.tenantId);
  if (error) return { ok: false, error: error.message };

  await logAudit({ action: "api_key.rotate", target: `api_key:${keyId}`, tenantId: ctx.tenantId });
  revalidate();
  return { ok: true, secret: token };
}

/** Revoke a key immediately — subsequent API calls with it fail 401. */
export async function revokeApiKeyAction(keyId: string): Promise<ActionResult> {
  const ctx = await requireManager();
  if ("error" in ctx) return ctx.error;

  const supabase = await createClient();
  const { error } = await supabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", keyId)
    .eq("tenant_id", ctx.tenantId);
  if (error) return { ok: false, error: error.message };

  await logAudit({ action: "api_key.revoke", target: `api_key:${keyId}`, tenantId: ctx.tenantId });
  revalidate();
  return { ok: true };
}

/** Register a webhook endpoint. Returns the signing secret ONCE. */
export async function createWebhookAction(formData: FormData): Promise<ActionResult> {
  const ctx = await requireManager();
  if ("error" in ctx) return ctx.error;

  const url = ((formData.get("url") as string | null) ?? "").trim();
  if (!/^https:\/\/.+/i.test(url)) return { ok: false, error: "Enter a valid https:// URL." };
  const description = ((formData.get("description") as string | null) ?? "").trim() || null;
  const eventTypes = formData
    .getAll("event_types")
    .map((e) => String(e))
    .filter((e) => (WEBHOOK_EVENT_TYPES as readonly string[]).includes(e));
  if (eventTypes.length === 0) return { ok: false, error: "Select at least one event." };

  const signingSecret = generateSigningSecret();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("webhook_endpoints")
    .insert({
      tenant_id: ctx.tenantId,
      url,
      signing_secret: signingSecret,
      event_types: eventTypes,
      description,
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  await logAudit({
    action: "webhook.create",
    target: `webhook_endpoint:${data.id}`,
    meta: { url, event_types: eventTypes },
    tenantId: ctx.tenantId,
  });
  revalidate();
  return { ok: true, secret: signingSecret };
}

/** Enable/disable an endpoint without deleting it. */
export async function toggleWebhookAction(endpointId: string, enabled: boolean): Promise<ActionResult> {
  const ctx = await requireManager();
  if ("error" in ctx) return ctx.error;

  const supabase = await createClient();
  const { error } = await supabase
    .from("webhook_endpoints")
    .update({ enabled })
    .eq("id", endpointId)
    .eq("tenant_id", ctx.tenantId);
  if (error) return { ok: false, error: error.message };

  await logAudit({
    action: enabled ? "webhook.enable" : "webhook.disable",
    target: `webhook_endpoint:${endpointId}`,
    tenantId: ctx.tenantId,
  });
  revalidate();
  return { ok: true };
}

/** Delete an endpoint (its delivery history cascades away). */
export async function deleteWebhookAction(endpointId: string): Promise<ActionResult> {
  const ctx = await requireManager();
  if ("error" in ctx) return ctx.error;

  const supabase = await createClient();
  const { error } = await supabase
    .from("webhook_endpoints")
    .delete()
    .eq("id", endpointId)
    .eq("tenant_id", ctx.tenantId);
  if (error) return { ok: false, error: error.message };

  await logAudit({ action: "webhook.delete", target: `webhook_endpoint:${endpointId}`, tenantId: ctx.tenantId });
  revalidate();
  return { ok: true };
}
