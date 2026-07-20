import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ProviderKey } from "@/lib/providers/registry";

/**
 * Cost tracking hook for the AI Gateway (ISS-P2-06). Records a provider call's
 * cost into the EXISTING `api_usage` table (no duplicate cost store). Dry-run
 * calls record $0, so the ledger is complete without any paid run. Never
 * throws — cost accounting must not break the operation it measures.
 */
export async function recordProviderCost(opts: {
  tenantId: string;
  provider: ProviderKey;
  capability: string;
  costUsd: number;
  units?: number;
  stage?: string | null;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("api_usage").insert({
      tenant_id: opts.tenantId,
      provider: opts.provider,
      endpoint: `gateway:${opts.capability}`,
      units: opts.units ?? 1,
      cost_usd: opts.costUsd,
      stage: opts.stage ?? null,
    });
  } catch {
    // best-effort
  }
}
