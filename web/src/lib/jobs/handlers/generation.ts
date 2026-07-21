import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { runStoryGeneration } from "@/lib/pipeline/generation";
import { QuotaExceededError, checkTenantBudget } from "@/lib/ops/entitlements";
import type { MockStorySettings } from "@/lib/generate/mock-story";
import { NonRetryableJobError, type JobHandler } from "@/lib/jobs/types";

/**
 * Durable generation handler (M11 Phase B). Serves both `generation.run` and
 * the scheduler's `schedule.generate` — ONE handler, no duplicated generation
 * logic. It drives the existing M4 engine (`runStoryGeneration`), which itself
 * resolves the provider through the AI Gateway selection seam and the per-tenant
 * Vault credential seam (M3), enforces plan quota (M6), and writes the normal
 * pipeline state that the review workflow consumes.
 *
 * Tenant scope always comes from `job.tenant_id` (authoritative). The payload
 * carries only non-secret execution options — never credentials.
 */

async function loadTenantSettings(
  admin: SupabaseClient,
  tenantId: string
): Promise<{ settings: MockStorySettings; projectId: string | null; budget: number | null }> {
  const [{ data: project }, { data: ts }] = await Promise.all([
    admin
      .from("projects")
      .select("id, per_video_budget_usd, target_seconds, niche, language")
      .eq("tenant_id", tenantId)
      .limit(1)
      .maybeSingle(),
    admin.from("tenant_settings").select("industry, keywords").eq("tenant_id", tenantId).maybeSingle(),
  ]);
  return {
    settings: {
      niche: project?.niche ?? null,
      language: project?.language ?? null,
      targetSeconds: project?.target_seconds ?? 45,
      industry: ts?.industry ?? null,
      keywords: (ts?.keywords as string[] | null) ?? null,
    },
    projectId: project?.id ?? null,
    budget: project?.per_video_budget_usd ?? null,
  };
}

export const generationRunHandler: JobHandler = async (job) => {
  if (!job.tenant_id) throw new Error("generation job is missing tenant_id");
  const admin = createAdminClient();

  const payload = job.payload ?? {};
  const topicInput = typeof payload.topicInput === "string" ? payload.topicInput : null;

  // Engine-level cost governor (ADR-032): refuse to start work for a tenant
  // that is over its monthly budget. Terminal — retrying cannot free budget.
  const budgetCheck = await checkTenantBudget(job.tenant_id, admin);
  if (!budgetCheck.allowed) {
    throw new NonRetryableJobError(budgetCheck.reason ?? "Monthly cost budget exhausted.");
  }

  const { settings, projectId, budget } = await loadTenantSettings(admin, job.tenant_id);

  try {
    const result = await runStoryGeneration({
      tenantId: job.tenant_id, // authoritative isolation boundary — never payload
      topicInput,
      settings,
      projectId: (payload.projectId as string | null) ?? projectId,
      perVideoBudgetUsd: budget,
      mode: "dry", // paid execution stays owner-gated
      client: admin,
    });
    return { checkpoint: { storyId: result.storyId, provider: result.provider, mode: result.mode } };
  } catch (err) {
    // Plan-quota exhaustion is a terminal SKIP, not a failure: retrying cannot
    // help within the window (preserves M5/M6 semantics).
    if (err instanceof QuotaExceededError) {
      return { checkpoint: { skipped: "quota", reason: err.message } };
    }
    throw err; // real failures -> Job Engine retry/backoff/DLQ
  }
};

/** Back-compat alias for the scheduler's job type (same handler). */
export const scheduleGenerateHandler = generationRunHandler;
