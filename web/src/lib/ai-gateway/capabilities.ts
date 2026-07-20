import {
  PROVIDER_KEYS,
  PROVIDER_REGISTRY,
  type ProviderCapability,
  type ProviderKey,
} from "@/lib/providers/registry";

/**
 * Provider capability discovery for the AI Gateway (ISS-P2-06). Pure reads off
 * the registry — no server-only, so the gateway console can render the same
 * capability matrix. Adding a capability to a provider is a registry edit.
 */

/** All AI-kind providers (those the gateway can route to). */
export function aiProviders(): ProviderKey[] {
  return PROVIDER_KEYS.filter((k) => PROVIDER_REGISTRY[k].kind === "ai");
}

/** Capabilities a provider offers (empty for non-AI providers). */
export function getProviderCapabilities(key: ProviderKey): ProviderCapability[] {
  return PROVIDER_REGISTRY[key].capabilities ?? [];
}

/** Does this provider offer the capability? */
export function providerSupports(key: ProviderKey, capability: ProviderCapability): boolean {
  return getProviderCapabilities(key).includes(capability);
}

/** All providers that can serve a capability, in registry order. */
export function providersForCapability(capability: ProviderCapability): ProviderKey[] {
  return aiProviders().filter((k) => providerSupports(k, capability));
}

/** Every capability offered by at least one provider. */
export function allCapabilities(): ProviderCapability[] {
  const seen = new Set<ProviderCapability>();
  for (const k of aiProviders()) for (const c of getProviderCapabilities(k)) seen.add(c);
  return Array.from(seen);
}
