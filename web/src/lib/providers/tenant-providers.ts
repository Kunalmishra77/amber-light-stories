import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The canonical set of provider keys the platform supports. Single source of
 * truth — credential storage, testing, and (in M4) generation/publishing all
 * key off this, so the system is provider-abstracted rather than hardcoded to
 * any one vendor (Bible Part 5 §13 / ADR-003).
 */
export const PROVIDER_KEYS = [
  "openai",
  "gemini",
  "elevenlabs",
  "fal",
  "youtube",
  "gmail",
] as const;
export type ProviderKey = (typeof PROVIDER_KEYS)[number];

const PROVIDER_SET: ReadonlySet<string> = new Set(PROVIDER_KEYS);
export function isProviderKey(value: string): value is ProviderKey {
  return PROVIDER_SET.has(value);
}

/**
 * Resolve a tenant's secret for a provider from the Supabase Vault
 * (`get_credential`, service-role only — the RPC is revoked from
 * authenticated/anon). This is THE seam every credential-consuming path must
 * use: generation and publishing (M4) read per-tenant keys from here, NEVER a
 * global `.env` provider key (ISS-B2 / ADR-010/054).
 *
 * The caller MUST have already gated the request to `tenantId` (membership or
 * super-admin) — this uses the service role and does not re-check. The secret
 * is returned for immediate use and must never be logged or persisted to a
 * plain column.
 */
export async function getTenantCredential(
  tenantId: string,
  provider: ProviderKey
): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_credential", {
    p_tenant: tenantId,
    p_provider: provider,
  });
  if (error || !data) return null;
  return typeof data === "string" ? data : null;
}

/**
 * Presence check — whether the tenant has a usable secret for the provider,
 * without surfacing the secret itself. Use to gate features / show connection
 * status without touching the raw key.
 */
export async function hasTenantCredential(
  tenantId: string,
  provider: ProviderKey
): Promise<boolean> {
  const secret = await getTenantCredential(tenantId, provider);
  return Boolean(secret);
}
