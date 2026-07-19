"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/auth";
import { logAudit } from "@/lib/ops/audit";
import { notify } from "@/lib/ops/notify";
import { checkRateLimit, RATE_LIMIT_MESSAGE } from "@/lib/ops/rate-limit";
import { generateMockStory, type MockStorySettings } from "@/lib/generate/mock-story";
import { getStagePreview, STAGE_ORDER } from "@/lib/pipeline/stage-content";

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
 * Creates a draft story + its scene breakdown + a pipeline run parked at
 * `research` for review — all from a DETERMINISTIC MOCK ($0, no OpenAI or
 * any paid API). Mirrors how the 30-day planner mocks its content
 * (src/lib/planner/mock-plan.ts) but for a single, immediately-reviewable
 * story. Redirects to the new story's detail page on success.
 */
export async function generateStoryMock(formData: FormData): Promise<ActionResult> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { ok: false, error: "You're not a member of any workspace." };

  const rate = await checkRateLimit(tenantId, "generate_story_mock", 10, 60);
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

  const draft = generateMockStory({ tenantId, topicInput: topicInput || null, settings });

  const { data: story, error: storyError } = await supabase
    .from("stories")
    .insert({
      tenant_id: tenantId,
      project_id: project?.id ?? null,
      topic: draft.topic,
      logline: draft.logline,
      moral: draft.moral,
      beat_sheet: draft.beat_sheet,
      duration_seconds: draft.duration_seconds,
      status: "draft",
    })
    .select("id")
    .single();

  if (storyError || !story) {
    return { ok: false, error: storyError?.message ?? "Couldn't create the story." };
  }

  const sceneRows = draft.scenes.map((s) => ({
    tenant_id: tenantId,
    story_id: story.id,
    seq: s.seq,
    start_sec: s.start_sec,
    end_sec: s.end_sec,
    narration: s.narration,
    subtitle: s.subtitle,
    importance: s.importance,
    motion_type: s.motion_type,
    recommended_quality: s.recommended_quality,
    animate: s.animate,
    prompt: s.prompt,
  }));

  const { error: scenesError } = await supabase.from("scenes").insert(sceneRows);
  if (scenesError) return { ok: false, error: scenesError.message };

  const { data: run, error: runError } = await supabase
    .from("pipeline_runs")
    .insert({
      tenant_id: tenantId,
      story_id: story.id,
      status: "running",
      current_stage: "research",
      total_cost_usd: 0,
      budget_usd: project?.per_video_budget_usd ?? 1.55,
    })
    .select("id")
    .single();

  if (runError || !run) return { ok: false, error: runError?.message ?? "Couldn't start the pipeline run." };

  const storyForContent = {
    id: story.id,
    topic: draft.topic,
    logline: draft.logline,
    moral: draft.moral,
    duration_seconds: draft.duration_seconds,
    beat_sheet: draft.beat_sheet,
  };
  const scenesForContent = draft.scenes.map((s) => ({
    id: "",
    seq: s.seq,
    start_sec: s.start_sec,
    end_sec: s.end_sec,
    narration: s.narration,
    subtitle: s.subtitle,
    importance: s.importance,
    motion_type: s.motion_type,
    recommended_quality: s.recommended_quality,
    animate: s.animate,
    prompt: s.prompt,
  }));

  const stageRows = STAGE_ORDER.map((stage, i) => {
    const isFirst = i === 0;
    const isSecond = i === 1;
    const status = isFirst ? "done" : isSecond ? "awaiting_review" : "pending";
    const output =
      isFirst || isSecond
        ? { ...getStagePreview(stage, storyForContent, scenesForContent), generatedAt: new Date().toISOString() }
        : null;

    return {
      tenant_id: tenantId,
      run_id: run.id,
      stage,
      seq: i,
      status,
      output,
      approved_at: isFirst ? new Date().toISOString() : null,
    };
  });

  const { error: stagesError } = await supabase.from("pipeline_stages").insert(stageRows);
  if (stagesError) return { ok: false, error: stagesError.message };

  await logAudit({
    action: "generate.create_story_mock",
    target: `story:${story.id}`,
    meta: { topic: draft.topic, mock: true },
    tenantId,
  });

  await notify({
    tenantId,
    kind: "story_generated",
    title: "New draft story generated",
    body: `"${draft.topic}" is ready for review — $0, mock generation.`,
  });

  revalidatePath("/stories");
  revalidatePath("/pipeline");
  revalidatePath("/approvals");
  revalidatePath("/");

  redirect(`/stories/${story.id}`);
}
