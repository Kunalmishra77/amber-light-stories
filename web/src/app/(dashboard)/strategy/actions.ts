"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId, isOwnerOrManager } from "@/lib/auth";
import { logAudit } from "@/lib/ops/audit";
import { CONTENT_PILLARS, simpleHash } from "@/lib/planner/mock-plan";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Recomputes the content strategy summary from the tenant's profile and
 * stores it in `tenant_settings.config.strategy`. Deterministic-shaped MOCK
 * ($0) — reorders the shared content pillar set and writes a fresh cadence
 * note; this is the strategic layer the 30-day planner (src/lib/planner/mock-plan.ts)
 * draws its pillars from.
 */
export async function regenerateStrategy(): Promise<ActionResult> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { ok: false, error: "You're not a member of any workspace." };
  if (!(await isOwnerOrManager(tenantId))) {
    return { ok: false, error: "Only owners or managers can regenerate the strategy." };
  }

  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("tenant_settings")
    .select("industry, audience, keywords, competitors, tone, upload_frequency, config")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const seed = simpleHash(`${tenantId}:${Date.now()}`);
  const rotated = [...CONTENT_PILLARS.slice(seed % CONTENT_PILLARS.length), ...CONTENT_PILLARS.slice(0, seed % CONTENT_PILLARS.length)];

  const strategy = {
    mock: true,
    pillars: rotated,
    cadence: settings?.upload_frequency || "daily",
    generatedAt: new Date().toISOString(),
    note:
      "AI-researched strategy runs as a paid step (enabled later); this is a free, editable starting point built from your workspace profile.",
  };

  const currentConfig = (settings?.config ?? {}) as Record<string, unknown>;

  const { error } = await supabase
    .from("tenant_settings")
    .update({ config: { ...currentConfig, strategy } })
    .eq("tenant_id", tenantId);
  if (error) return { ok: false, error: error.message };

  await logAudit({ action: "strategy.regenerate", target: `tenant_settings:${tenantId}`, tenantId });

  revalidatePath("/strategy");
  return { ok: true };
}
