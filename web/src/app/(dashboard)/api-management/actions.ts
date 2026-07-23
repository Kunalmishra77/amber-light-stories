"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentTenantId, isOwnerOrManager } from "@/lib/auth";
import { denyUnless, PERMISSIONS } from "@/lib/authz";
import { logAudit } from "@/lib/ops/audit";
import { getTenantCredential, isProviderKey } from "@/lib/providers/tenant-providers";
import { checkProviderKey } from "@/lib/providers/validate";
import type { CredentialProvider } from "@/lib/onboarding/types";

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
  if (await denyUnless(PERMISSIONS.credentialsManage, tenantId)) {
    return { ok: false, error: "Only owners or managers can update credentials." };
  }

  const provider = ((formData.get("provider") as string | null) ?? "").trim();
  if (!isProviderKey(provider)) return { ok: false, error: "Choose a valid provider." };

  const secret = ((formData.get("secret") as string | null) ?? "").trim();
  if (!secret) return { ok: false, error: "Enter an API key." };

  // YouTube/Gmail connect via OAuth, not a pasted key — reject here so a client
  // can never store a meaningless "YouTube API key".
  if (provider === "youtube" || provider === "gmail") {
    return { ok: false, error: `${provider === "youtube" ? "YouTube" : "Gmail"} connects with Google sign-in, not an API key.` };
  }

  // VALIDATE the key against the provider BEFORE storing it, so a wrong or
  // expired key is never saved as "connected" (the audit found the old flow
  // stored blindly and only presence-checked afterwards).
  const check = await checkProviderKey(provider as CredentialProvider, secret);
  if (check.status === "invalid") {
    return { ok: false, error: check.message };
  }
  // quota_exceeded / connected both mean the key is VALID — store it. A pure
  // network error is surfaced so the client can retry rather than store blind.
  if (check.status === "error") {
    return { ok: false, error: check.message };
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("store_credential", {
    p_tenant: tenantId,
    p_provider: provider,
    p_secret: secret,
    p_meta: {},
  });
  if (error) {
    // Never echo the raw DB message — it can contain the offending value.
    console.error("[api-management] store_credential failed:", error.code ?? "unknown");
    return { ok: false, error: "Couldn't store the key securely. Please try again." };
  }

  await admin
    .from("tenant_credentials")
    .update({ status: check.status, last_checked_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("provider", provider);

  await logAudit({ action: "credentials.update", target: `tenant_credentials:${provider}`, meta: { status: check.status }, tenantId });

  revalidate();
  return { ok: true };
}

/**
 * REALLY tests a stored credential: pulls it from the Vault and makes the same
 * FREE provider metadata call the onboarding wizard uses (no generation, no
 * paid usage). The audit found the old version only checked that a secret
 * EXISTED — so a client who rotated to a wrong key still saw "Connected". Now
 * the status reflects whether the key actually works.
 */
export async function testConnection(provider: string): Promise<ActionResult> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { ok: false, error: "You're not a member of any workspace." };
  if (await denyUnless(PERMISSIONS.credentialsManage, tenantId)) {
    return { ok: false, error: "Only owners or managers can test connections." };
  }
  if (!isProviderKey(provider)) return { ok: false, error: "Unknown provider." };

  if (provider === "youtube" || provider === "gmail") {
    return { ok: false, error: `${provider === "youtube" ? "YouTube" : "Gmail"} is connected with Google sign-in, not an API key.` };
  }

  // Resolve the stored key from the per-tenant Vault (never a global .env key),
  // then validate it live.
  const secret = await getTenantCredential(tenantId, provider);
  if (!secret) return { ok: false, error: "No key stored for this provider yet." };

  const check = await checkProviderKey(provider as CredentialProvider, secret);

  const admin = createAdminClient();
  const { error: updateError } = await admin
    .from("tenant_credentials")
    .update({ status: check.status, last_checked_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("provider", provider);
  if (updateError) {
    console.error("[api-management] status update failed:", updateError.code ?? "unknown");
  }

  await logAudit({ action: "credentials.test", target: `tenant_credentials:${provider}`, meta: { status: check.status }, tenantId });

  revalidate();
  // "connected" and "quota_exceeded" both mean the key is valid.
  if (check.status === "connected" || check.status === "quota_exceeded") return { ok: true };
  return { ok: false, error: check.message };
}
