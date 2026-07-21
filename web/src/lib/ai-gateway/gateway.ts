import "server-only";
import type { ProviderKey } from "@/lib/providers/registry";
import { getTenantCredential } from "@/lib/providers/tenant-providers";
import {
  DEFAULT_POLICY,
  LiveGenerationDisabledError,
  type GatewayRequest,
  type GatewayResponse,
  type RoutePolicy,
} from "@/lib/ai-gateway/types";
import { selectProvider } from "@/lib/ai-gateway/selection";
import { resolveAdapter } from "@/lib/ai-gateway/adapters";
import { executeWithPolicy } from "@/lib/ai-gateway/policy";
import { recordProviderCost } from "@/lib/ai-gateway/cost";
import { recordProviderSuccess, recordProviderFailure } from "@/lib/ai-gateway/health";
import { isCircuitOpen } from "@/lib/ai-gateway/breaker";
import { recordDecision } from "@/lib/ai-gateway/decisions";

/**
 * The unified AI Gateway entry (ISS-P2-06). ONE path for every AI operation:
 *   select provider(s)  → registry + tenant-credential seam (selection.ts)
 *   execute with policy  → retry + timeout + backoff  (policy.ts)
 *   fail over            → next candidate on exhaustion (selection chain)
 *   cost + health hooks  → api_usage + provider_health
 * Provider-independent: it drives adapters through AIProviderAdapter. Live mode
 * hits the gated extension point (LiveGenerationDisabledError) and is NOT
 * caught/failed-over here — the gate is deliberate, not a provider outage.
 */
export async function runThroughGateway<TOutput = unknown>(
  request: GatewayRequest,
  policy: RoutePolicy = DEFAULT_POLICY
): Promise<GatewayResponse<TOutput>> {
  const selection = await selectProvider({
    capability: request.capability,
    tenantId: request.tenantId,
    preferenceOrder: request.preferenceOrder,
  });

  if (selection.candidates.length === 0) {
    throw new Error(`No provider offers the ${request.capability} capability.`);
  }

  const failedOver: ProviderKey[] = [];
  let lastError: unknown;

  for (const candidate of selection.candidates) {
    const provider = candidate.provider;

    // Circuit breaker (ADR-033): a provider that is repeatedly failing is
    // skipped WITHOUT being called, so a broken provider can't burn the retry
    // budget or stall the run. Half-open lets exactly one trial call through.
    if (await isCircuitOpen(provider)) {
      lastError = new Error(`Provider ${provider} circuit is open.`);
      failedOver.push(provider);
      continue;
    }

    const adapter = resolveAdapter(provider, request.mode);
    const credential =
      request.mode === "live" ? await getTenantCredential(request.tenantId, provider) : null;

    const startedAt = Date.now();
    try {
      const { value } = await executeWithPolicy(
        () => adapter.execute(request, credential),
        policy
      );
      const latencyMs = Date.now() - startedAt;

      await recordProviderSuccess(provider);
      await recordProviderCost({
        tenantId: request.tenantId,
        provider,
        capability: request.capability,
        costUsd: value.costUsd,
        stage: request.stage ?? null,
      });

      // Explainability (ADR-037 / P6-06): record WHAT was chosen, what was
      // rejected and WHY. The gateway remains the only router — this is the
      // audit trail over its decision, not a second routing system.
      await recordDecision({
        tenantId: request.tenantId,
        decisionType: "provider_selection",
        chosen: { provider, capability: request.capability, mode: request.mode, latencyMs, costUsd: value.costUsd },
        alternatives: selection.candidates
          .filter((c) => c.provider !== provider)
          .map((c) => ({
            provider: c.provider,
            hasCredential: c.hasCredential,
            rejected: failedOver.includes(c.provider) ? "failed_or_circuit_open" : "not_reached",
          })),
        signals: {
          capability: request.capability,
          selectionReason: selection.reason,
          failedOver,
          candidateCount: selection.candidates.length,
        },
        rationale: selection.reason,
        costEstimateUsd: value.costUsd,
        runId: null,
        jobId: null,
      });

      return {
        provider,
        mode: request.mode,
        output: value.output as TOutput,
        costUsd: value.costUsd,
        latencyMs,
        failedOver,
      };
    } catch (err) {
      // The live gate is intentional — surface it immediately, don't fail over.
      if (err instanceof LiveGenerationDisabledError) throw err;

      lastError = err;
      await recordProviderFailure(provider, err instanceof Error ? err.message : "unknown error");
      failedOver.push(provider);
      if (!policy.failover) break;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`All ${request.capability} providers failed.`);
}
