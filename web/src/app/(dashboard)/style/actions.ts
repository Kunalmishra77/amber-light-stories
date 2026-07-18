"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/auth";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Adds a style reference: a name plus one or more YouTube (or other) source
 * URLs. Stores an empty `profile` — the actual Gemini Vision analysis over
 * sampled frames is a paid step deferred to Phase 5.
 */
export async function addStyleReference(formData: FormData): Promise<ActionResult> {
  const name = ((formData.get("name") as string | null) ?? "").trim();
  const urlsRaw = (formData.get("urls") as string | null) ?? "";
  const urls = urlsRaw
    .split(/\r?\n/)
    .map((u) => u.trim())
    .filter(Boolean);

  if (!name) {
    return { ok: false, error: "Name is required." };
  }
  if (urls.length === 0) {
    return { ok: false, error: "Add at least one source URL." };
  }
  const invalidUrl = urls.find((u) => !/^https?:\/\/\S+$/i.test(u));
  if (invalidUrl) {
    return { ok: false, error: `"${invalidUrl}" doesn't look like a valid URL.` };
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { ok: false, error: "You're not a member of any workspace." };

  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("style_profiles").insert({
    tenant_id: tenantId,
    project_id: project?.id ?? null,
    name,
    source_urls: urls,
    profile: {},
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/style");
  return { ok: true };
}
