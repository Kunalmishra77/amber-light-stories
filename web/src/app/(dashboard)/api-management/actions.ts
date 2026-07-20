"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentTenantId, isOwnerOrManager } from "@/lib/auth";
import { logAudit } from "@/lib/ops/audit";
import { getTenantCredential, isProviderKey } from "@/lib/providers/tenant-providers";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

function revalidate() {
  revalidatePath("/api-management");
  revalidatePath("/");
}

/**
 * Stores/rotates a provider credential via the `store_credential` Vault RPC
 * (db/migrations/006_onboarding_vault.sql). That function is revoked from
 * `authenticated`/`anon`, so it can only be called through the service-role
 * admin client — the `isOwnerOrManager` check below is what actually gates
 * this for tenant users. The raw secret is never written to a plain table,
 * never returned, and never logged.
 */
export async function updateCredentialKey(formData: FormData): Promise<ActionResult> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { ok: false, error: "You're not a member of any workspace." };
  if (!(await isOwnerOrManager(tenantId))) {
    return { ok: false, error: "Only owners or managers can update credentials." };
  }

  const provider = ((formData.get("provider") as string | null) ?? "").trim();
  if (!isProviderKey(provider)) return { ok: false, error: "Choose a valid provider." };

  const secret = ((formData.get("secret") as string | null) ?? "").trim();
  if (!secret) return { ok: false, error: "Enter an API key." };

  const admin = createAdminClient();
  const { error } = await admin.rpc("store_credential", {
    p_tenant: tenantId,
    p_provider: provider,
    p_secret: secret,
    p_meta: {},
  });
  if (error) return { ok: false, error: error.message };

  await logAudit({ action: "credentials.update", target: `tenant_credentials:${provider}`, tenantId });

  revalidate();
  return { ok: true };
}

/**
 * "Tests" a stored credential by confirming the Vault secret still resolves
 * (via `get_credential`, also service-role only) and refreshing
 * `last_checked_at` / `status` — a lightweight presence check, not a live
 * call to the provider's API (no paid calls here).
 */
export async function testConnection(provider: string): Promise<ActionResult> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { ok: false, error: "You're not a member of any workspace." };
  if (!(await isOwnerOrManager(tenantId))) {
    return { ok: false, error: "Only owners or managers can test connections." };
  }
  if (!isProviderKey(provider)) return { ok: false, error: "Unknown provider." };

  // Presence check via the centralized per-tenant Vault resolver (never a
  // global .env key — ISS-B2). No paid provider call here.
  const secret = await getTenantCredential(tenantId, provider);
  const status = secret ? "connected" : "missing_permission";

  const admin = createAdminClient();
  const { error: updateError } = await admin
    .from("tenant_credentials")
    .update({ status, last_checked_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("provider", provider);
  if (updateError) return { ok: false, error: updateError.message };

  await logAudit({ action: "credentials.test", target: `tenant_credentials:${provider}`, meta: { status }, tenantId });

  revalidate();
  return secret ? { ok: true } : { ok: false, error: "No key stored for this provider yet." };
}
