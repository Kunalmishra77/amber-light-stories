/**
 * Provider registry — the SINGLE source of truth for which providers the
 * platform supports (Bible Part 2 §2.2 AI/Publishing Provider Registries,
 * ADR-003 / ADR-015).
 *
 * Adding a provider is ONE entry here. The credential + channel RESOLVERS
 * (`tenant-providers.ts`, `publishing.ts`) are provider-agnostic and never
 * change — they key off the provider string against the per-tenant Vault and
 * `channels`. What a *new* provider additionally needs is an ADAPTER for real
 * API calls (M4) and, optionally, UI/validation — never a resolver change.
 *
 * This const is the seam a future DB-backed registry (ISS-P2-03 / M8) swaps
 * in behind the same accessors, again without touching the resolvers.
 *
 * Pure data (no server-only), so labels/kinds are usable from client UI too.
 */

export type ProviderKind = "ai" | "publishing" | "email";

/** What an AI provider can do — used by the AI Gateway for capability
 * discovery + routing (ISS-P2-06). Purely declarative registry data; adding a
 * capability to a provider never changes the gateway or resolvers. */
export type ProviderCapability = "text" | "image" | "tts" | "video" | "music";

export interface ProviderDef {
  label: string;
  kind: ProviderKind;
  /** True for destinations that publish content and own `channels` rows
   * (ISS-E1 / ADR-015): YouTube today; Instagram/TikTok/LinkedIn/etc. become
   * one entry each here + an adapter, with no resolver change. */
  publishing?: boolean;
  /** AI capabilities this provider offers (AI providers only). The gateway
   * discovers routable providers per capability from this list. */
  capabilities?: ProviderCapability[];
}

// `satisfies` validates each entry against ProviderDef while keeping the
// literal keys (for ProviderKey); the exported view is typed as
// Record<ProviderKey, ProviderDef> so the optional `publishing` field is
// uniformly accessible on every entry.
const REGISTRY = {
  openai: { label: "OpenAI", kind: "ai", capabilities: ["text", "image"] },
  gemini: { label: "Google Gemini", kind: "ai", capabilities: ["text", "image"] },
  elevenlabs: { label: "ElevenLabs", kind: "ai", capabilities: ["tts"] },
  fal: { label: "fal.ai", kind: "ai", capabilities: ["image", "video", "music"] },
  youtube: { label: "YouTube", kind: "publishing", publishing: true },
  gmail: { label: "Gmail", kind: "email" },
  // Add future providers here (one line each), e.g.:
  //   runway:    { label: "Runway",    kind: "ai" },
  //   instagram: { label: "Instagram", kind: "publishing", publishing: true },
  //   tiktok:    { label: "TikTok",    kind: "publishing", publishing: true },
  //   linkedin:  { label: "LinkedIn",  kind: "publishing", publishing: true },
  // The resolvers require NO change — only an M4 adapter for real calls.
} satisfies Record<string, ProviderDef>;

/** Every registered provider key (union derived from the registry). */
export type ProviderKey = keyof typeof REGISTRY;

export const PROVIDER_REGISTRY: Record<ProviderKey, ProviderDef> = REGISTRY;

/** All provider keys, at runtime. */
export const PROVIDER_KEYS = Object.keys(REGISTRY) as ProviderKey[];

/** Type guard: is this string a registered provider? */
export function isProviderKey(value: string): value is ProviderKey {
  return Object.prototype.hasOwnProperty.call(REGISTRY, value);
}

/** Is this a registered PUBLISHING destination (owns channels)? */
export function isPublishingProvider(value: string): value is ProviderKey {
  return isProviderKey(value) && PROVIDER_REGISTRY[value].publishing === true;
}

/** Human label for a provider. */
export function providerLabel(key: ProviderKey): string {
  return PROVIDER_REGISTRY[key].label;
}
