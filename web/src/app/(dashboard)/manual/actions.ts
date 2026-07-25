"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/auth";
import { buildManualDraft } from "@/lib/generate/manual-story";
import { runStoryGeneration } from "@/lib/pipeline/generation";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

interface ProjectLite {
  id: string;
  target_seconds: number | null;
  per_video_budget_usd: number | null;
  niche: string | null;
  language: string | null;
}

/**
 * Turns a client-written title + script into a REAL video the same way the AI
 * generator does — it builds the story + scene breakdown + a full pipeline run
 * from the pasted script (narration and subtitles are the client's exact
 * words) and hands it to the identical pipeline. Previously this only saved a
 * draft row with no run, so a manual story never reached the Video Pipeline.
 */
export async function addManualStory(formData: FormData): Promise<ActionResult> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { ok: false, error: "You're not a member of any workspace." };

  const title = ((formData.get("title") as string | null) ?? "").trim();
  if (!title) return { ok: false, error: "Title is required." };

  const script = ((formData.get("script") as string | null) ?? "").trim();
  if (!script) {
    return { ok: false, error: "Add your script — it's what the video narrates and captions." };
  }

  const supabase = await createClient();

  // The project row carries the render format/budget the story inherits.
  const { ensureTenantProject } = await import("@/lib/projects/ensure");
  await ensureTenantProject(tenantId);
  const { data: project } = await supabase
    .from("projects")
    .select("id, target_seconds, per_video_budget_usd, niche, language")
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle<ProjectLite>();

  const draft = buildManualDraft({
    title,
    script,
    settings: {
      targetSeconds: project?.target_seconds ?? 45,
      niche: project?.niche ?? null,
      language: project?.language ?? null,
    },
  });

  let storyId: string;
  try {
    const result = await runStoryGeneration({
      tenantId,
      topicInput: title,
      settings: {
        targetSeconds: project?.target_seconds ?? 45,
        niche: project?.niche ?? null,
        language: project?.language ?? null,
      },
      projectId: project?.id ?? null,
      perVideoBudgetUsd: project?.per_video_budget_usd ?? null,
      prebuiltDraft: draft,
      client: supabase,
    });
    storyId = result.storyId;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't build the video." };
  }

  revalidatePath("/stories");
  revalidatePath("/pipeline");
  revalidatePath("/approvals");
  revalidatePath("/manual");
  redirect(`/stories/${storyId}`);
}
