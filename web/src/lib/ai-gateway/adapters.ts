import "server-only";
import type { ProviderCapability, ProviderKey } from "@/lib/providers/registry";
import {
  type AIProviderAdapter,
  type GatewayMode,
  type GatewayRequest,
  LiveGenerationDisabledError,
} from "@/lib/ai-gateway/types";
import { providerSupports } from "@/lib/ai-gateway/capabilities";

/**
 * Provider adapters for the AI Gateway (ISS-P2-06). Two built-ins, neither of
 * which contains provider-specific business logic:
 *   - dryRunAdapter: deterministic, $0 — produces reviewable placeholder output
 *     for ANY provider/capability. This is the current production path.
 *   - liveAdapter:   the gated extension point. Throws LiveGenerationDisabledError
 *     until the owner authorizes paid runs (Product Bible Part 1). Real, per-
 *     provider adapters replace this ONE function without touching callers.
 */
function dryRunAdapter(provider: ProviderKey): AIProviderAdapter {
  return {
    key: provider,
    supports: (capability: ProviderCapability) => providerSupports(provider, capability),
    async execute(request: GatewayRequest) {
      return {
        output: {
          dryRun: true,
          provider,
          capability: request.capability,
          note: `Deterministic dry-run output for ${request.capability} via ${provider} — no paid call made.`,
        },
        costUsd: 0,
      };
    },
  };
}

function liveAdapter(provider: ProviderKey): AIProviderAdapter {
  return {
    key: provider,
    supports: (capability: ProviderCapability) => providerSupports(provider, capability),
    async execute() {
      throw new LiveGenerationDisabledError();
    },
  };
}

/** Resolve the adapter for a provider + mode. */
export function resolveAdapter(provider: ProviderKey, mode: GatewayMode): AIProviderAdapter {
  return mode === "live" ? liveAdapter(provider) : dryRunAdapter(provider);
}
