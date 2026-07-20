import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { PROVIDER_KEYS, isProviderKey, type ProviderKey } from "@/lib/providers/registry";

// The provider set + guards live in the registry (the single source of truth,
// ADR-003). Re-exported here so existing credential-management consumers keep
// importing from this module. Adding a provider = one registry entry; this
// resolver never changes.
export { PROVIDER_KEYS, isProviderKey, type ProviderKey };

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
