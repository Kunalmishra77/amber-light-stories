import type { ProviderCapability, ProviderKey } from "@/lib/providers/registry";

/**
 * AI Gateway (ISS-P2-06) — the unified, provider-independent execution
 * contract. Every AI operation flows through this shape: the gateway selects a
 * provider (registry + tenant credential seam), applies retry/timeout/failover
 * policy, invokes a provider adapter, and records cost + health hooks. Real
 * paid adapters plug in behind `AIProviderAdapter` without changing callers.
 */
export type GatewayMode = "dry" | "live";

export interface GatewayRequest<TInput = unknown> {
  /** What capability is needed (text/image/tts/video/music). */
  capability: ProviderCapability;
  tenantId: string;
  /** "dry" ($0, deterministic) or "live" (paid — gated extension point). */
  mode: GatewayMode;
  /** Opaque, provider-independent operation input. */
  input: TInput;
  /** Optional pipeline stage this call belongs to (for cost attribution). */
  stage?: string;
  /** Ordered provider preference; falls back to registry order when omitted. */
  preferenceOrder?: ProviderKey[];
}

export interface GatewayResponse<TOutput = unknown> {
  provider: ProviderKey;
  mode: GatewayMode;
  output: TOutput;
  costUsd: number;
  latencyMs: number;
  /** Providers that were tried and failed before this one succeeded. */
  failedOver: ProviderKey[];
}

/**
 * Provider-independent execution interface. A concrete adapter maps the
 * gateway request onto one provider's API. The dry-run adapter is the only
 * built-in; live adapters are the paid extension point (Product Bible Part 1).
 */
export interface AIProviderAdapter {
  key: ProviderKey;
  /** True if this adapter can serve the capability. */
  supports(capability: ProviderCapability): boolean;
  execute(request: GatewayRequest, credential: string | null): Promise<{ output: unknown; costUsd: number }>;
}

/** Retry / timeout / failover policy applied around every adapter call. */
export interface RoutePolicy {
  /** Max attempts PER provider before failing over to the next. */
  retries: number;
  timeoutMs: number;
  /** Base backoff between retries (doubled each attempt). */
  backoffMs: number;
  /** Whether to fail over to the next candidate provider on exhaustion. */
  failover: boolean;
}

export const DEFAULT_POLICY: RoutePolicy = {
  retries: 2,
  timeoutMs: 30_000,
  backoffMs: 250,
  failover: true,
};

/**
 * The gated live-execution extension point. Live (paid) adapters throw this
 * until the owner explicitly authorizes paid runs. Kept in the gateway so
 * there is ONE definition; re-exported from the generation module for callers
 * that already catch it.
 */
export class LiveGenerationDisabledError extends Error {
  constructor() {
    super("Live (paid) generation is not enabled — dry-run only until explicitly authorized.");
    this.name = "LiveGenerationDisabledError";
  }
}
