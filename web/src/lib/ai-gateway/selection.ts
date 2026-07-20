import "server-only";
import { PROVIDER_REGISTRY, type ProviderCapability, type ProviderKey } from "@/lib/providers/registry";
import { hasTenantCredential } from "@/lib/providers/tenant-providers";
import { providersForCapability } from "@/lib/ai-gateway/capabilities";

/**
 * Central provider selection for the AI Gateway (ISS-P2-06). Discovers every
 * provider that can serve a capability (registry), orders them by caller
 * preference then registry order, and annotates each with per-tenant
 * credential presence (the Vault seam — never a global .env key). The ordered
 * list IS the failover chain; the primary is the first candidate that has a
 * credential (so live calls hit a configured provider), falling back to the
 * first candidate overall (so dry runs work before any key is connected).
 */
export interface ProviderCandidate {
  provider: ProviderKey;
  label: string;
  hasCredential: boolean;
}

export interface ProviderSelection {
  capability: ProviderCapability;
  primary: ProviderKey;
  /** Ordered failover chain (primary first). */
  candidates: ProviderCandidate[];
  reason: string;
}

function orderProviders(
  capability: ProviderCapability,
  preferenceOrder?: ProviderKey[]
): ProviderKey[] {
  const supporting = providersForCapability(capability);
  if (!preferenceOrder?.length) return supporting;
  const preferred = preferenceOrder.filter((p) => supporting.includes(p));
  const rest = supporting.filter((p) => !preferred.includes(p));
  return [...preferred, ...rest];
}

export async function selectProvider(opts: {
  capability: ProviderCapability;
  tenantId: string;
  preferenceOrder?: ProviderKey[];
}): Promise<ProviderSelection> {
  const ordered = orderProviders(opts.capability, opts.preferenceOrder);

  const candidates: ProviderCandidate[] = await Promise.all(
    ordered.map(async (provider) => ({
      provider,
      label: PROVIDER_REGISTRY[provider].label,
      hasCredential: await hasTenantCredential(opts.tenantId, provider),
    }))
  );

  const configured = candidates.find((c) => c.hasCredential);
  const primary = configured?.provider ?? candidates[0]?.provider;
  const reason = configured
    ? `Selected ${configured.provider}: first ${opts.capability}-capable provider with a tenant credential.`
    : candidates.length > 0
      ? `No credential configured for any ${opts.capability} provider; defaulting to ${primary} (dry-run only).`
      : `No provider offers the ${opts.capability} capability.`;

  // Put the chosen primary at the head of the failover chain.
  const chain = primary
    ? [candidates.find((c) => c.provider === primary)!, ...candidates.filter((c) => c.provider !== primary)]
    : candidates;

  return { capability: opts.capability, primary, candidates: chain, reason };
}
