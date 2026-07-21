import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { runStoryGeneration } from "@/lib/pipeline/generation";
import { QuotaExceededError } from "@/lib/ops/entitlements";
import type { MockStorySettings } from "@/lib/generate/mock-story";
import type { JobHandler } from "@/lib/jobs/types";

/**
 * `schedule.generate` job handler (M11-2). The durable replacement for the M5
 * scheduler's DIRECT execution: a due schedule enqueues one of these jobs and
 * the Job Engine runs it here. Reuses the existing `runStoryGeneration` (DRY,
 * $0 — no duplicated generation logic, no paid execution). Tenant scope comes
 * from `job.tenant_id` (authoritative); the payload is never trusted for
 * isolation and carries only non-secret scheduling metadata.
 */

/** Tenant generation defaults (same shape the M5 runner used). */
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

export const scheduleGenerateHandler: JobHandler = async (job) => {
  if (!job.tenant_id) throw new Error("schedule.generate job is missing tenant_id");
  const admin = createAdminClient();

  const { settings, projectId, budget } = await loadTenantSettings(admin, job.tenant_id);

  try {
    const result = await runStoryGeneration({
      tenantId: job.tenant_id, // authoritative isolation boundary — never payload
      topicInput: null,
      settings,
      projectId,
      perVideoBudgetUsd: budget,
      mode: "dry", // never trigger paid execution from the scheduler
      client: admin,
    });
    return { checkpoint: { storyId: result.storyId, provider: result.provider, mode: result.mode } };
  } catch (err) {
    // Preserve M5 semantics: plan-quota exhaustion is a SKIP, not a failure.
    // Returning success (not throwing) avoids pointless retries — the quota
    // won't free up within this scheduling window.
    if (err instanceof QuotaExceededError) {
      return { checkpoint: { skipped: "quota" } };
    }
    // Real failures propagate into M11-1 retry/backoff/DLQ.
    throw err;
  }
};
