"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/auth";
import { denyUnless, PERMISSIONS } from "@/lib/authz";
import { checkRateLimit, RATE_LIMIT_MESSAGE } from "@/lib/ops/rate-limit";
import type { MockStorySettings } from "@/lib/generate/mock-story";
import { runStoryGeneration, LiveGenerationDisabledError } from "@/lib/pipeline/generation";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

interface ProjectLite {
  id: string;
  per_video_budget_usd: number | null;
  target_seconds: number | null;
  niche: string | null;
  language: string | null;
}

interface TenantSettingsLite {
  industry: string | null;
  keywords: string[] | null;
}

/**
 * Generate one draft story + scene breakdown + a pipeline run parked at
 * `research` for review. Thin action over the generation engine
 * (`lib/pipeline/generation.ts`): it gathers the tenant's project/settings,
 * then invokes `runStoryGeneration` in DRY mode ($0 — no paid provider call),
 * which resolves the provider + per-tenant credential via the M3 seam and
 * writes the reviewable pipeline state. Redirects to the story on success.
 */
export async function generateStory(formData: FormData): Promise<ActionResult> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { ok: false, error: "You're not a member of any workspace." };

  const denied = await denyUnless(PERMISSIONS.contentCreate, tenantId);
  if (denied) return { ok: false, error: denied };

  const rate = await checkRateLimit(tenantId, "generate_story", 10, 60);
  if (!rate.allowed) return { ok: false, error: RATE_LIMIT_MESSAGE };

  const topicInput = ((formData.get("topic") as string | null) ?? "").trim();
  const useNiche = formData.get("use_niche") === "on";

  const supabase = await createClient();
  const [{ data: project }, { data: tenantSettings }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, per_video_budget_usd, target_seconds, niche, language")
      .eq("tenant_id", tenantId)
      .limit(1)
      .maybeSingle<ProjectLite>(),
    supabase
      .from("tenant_settings")
      .select("industry, keywords")
      .eq("tenant_id", tenantId)
      .maybeSingle<TenantSettingsLite>(),
  ]);

  const settings: MockStorySettings = {
    niche: project?.niche ?? null,
    language: project?.language ?? null,
    targetSeconds: project?.target_seconds ?? 45,
    industry: tenantSettings?.industry ?? null,
    keywords: useNiche ? (tenantSettings?.keywords ?? null) : null,
  };

  let storyId: string;
  try {
    const result = await runStoryGeneration({
      tenantId,
      topicInput: topicInput || null,
      settings,
      projectId: project?.id ?? null,
      perVideoBudgetUsd: project?.per_video_budget_usd ?? null,
      mode: "dry",
    });
    storyId = result.storyId;
  } catch (err) {
    if (err instanceof LiveGenerationDisabledError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: err instanceof Error ? err.message : "Generation failed." };
  }

  revalidatePath("/stories");
  revalidatePath("/pipeline");
  revalidatePath("/approvals");
  revalidatePath("/");

  redirect(`/stories/${storyId}`);
}
