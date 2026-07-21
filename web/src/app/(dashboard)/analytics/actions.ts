"use server";

import { revalidatePath } from "next/cache";
import { getCurrentTenantId, isOwnerOrManager } from "@/lib/auth";
import { ingestTenantAnalytics } from "@/lib/analytics/ingest";

export interface ActionResult {
  ok: boolean;
  error?: string;
  ingested?: number;
}

/**
 * On-demand analytics refresh for the current workspace (M10 / ISS-P3-05).
 * Runs a DRY ingestion ($0) over the tenant's published videos. Live ingestion
 * flips on automatically once real YouTube credentials are connected — the
 * adapter resolves the mode; this action stays the same.
 */
export async function refreshAnalyticsAction(): Promise<ActionResult> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { ok: false, error: "You're not a member of any workspace." };
  if (!(await isOwnerOrManager(tenantId))) {
    return { ok: false, error: "Only owners or managers can refresh analytics." };
  }

  try {
    const result = await ingestTenantAnalytics({ tenantId, mode: "dry" });
    revalidatePath("/analytics");
    return { ok: true, ingested: result.ingested };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't refresh analytics." };
  }
}
