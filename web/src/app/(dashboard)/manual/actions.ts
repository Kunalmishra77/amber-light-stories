"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/auth";
import { logAudit } from "@/lib/ops/audit";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/** Adds a hand-written story — title (+ optional script) — with no
 * generation involved at all, mock or otherwise. Marked `source: "manual"`
 * in `beat_sheet` so it's distinguishable from AI-mocked drafts. */
export async function addManualStory(formData: FormData): Promise<ActionResult> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { ok: false, error: "You're not a member of any workspace." };

  const title = ((formData.get("title") as string | null) ?? "").trim();
  if (!title) return { ok: false, error: "Title is required." };

  const script = ((formData.get("script") as string | null) ?? "").trim();

  const supabase = await createClient();
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle<{ id: string }>();

  const { data: story, error } = await supabase
    .from("stories")
    .insert({
      tenant_id: tenantId,
      project_id: project?.id ?? null,
      topic: title,
      status: "draft",
      beat_sheet: {
        source: "manual",
        script: script || null,
        addedAt: new Date().toISOString(),
      },
    })
    .select("id")
    .single();

  if (error || !story) return { ok: false, error: error?.message ?? "Couldn't create the story." };

  await logAudit({
    action: "manual.add_story",
    target: `story:${story.id}`,
    meta: { title, hasScript: Boolean(script) },
    tenantId,
  });

  revalidatePath("/stories");
  revalidatePath("/manual");
  redirect(`/stories/${story.id}`);
}
