"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/auth";
import { denyUnless, PERMISSIONS } from "@/lib/authz";
import { logAudit } from "@/lib/ops/audit";
import { STAGE_ORDER } from "@/lib/pipeline/stage-content";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/** Splits a comma-separated form field into a trimmed, de-duplicated array. */
function toArray(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string" || !value.trim()) return [];
  return Array.from(
    new Set(
      value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    )
  );
}

function str(formData: FormData, key: string): string {
  return ((formData.get(key) as string | null) ?? "").trim();
}

async function requireEditableTenant(): Promise<{ tenantId: string } | { error: string }> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { error: "You're not a member of any workspace." };
  if (await denyUnless(PERMISSIONS.settingsManage, tenantId)) {
    return { error: "Only owners or managers can change these settings." };
  }
  return { tenantId };
}

function revalidateSettings() {
  revalidatePath("/settings");
  revalidatePath("/");
  revalidatePath("/workspace");
}

const AUTO_APPROVE_STAGES = STAGE_ORDER.filter(
  (stage) => !["human_review", "schedule", "publish"].includes(stage)
);

const VALID_LANGUAGES = new Set(["en", "hi"]);
const VALID_ASPECTS = new Set(["9:16", "16:9", "1:1"]);

/**
 * Updates the single `projects` row: general production settings plus the
 * per-stage auto-approve matrix, both submitted together from one form.
 */
export async function updateProjectSettings(formData: FormData): Promise<ActionResult> {
  const id = (formData.get("id") as string | null) ?? "";
  if (!id) return { ok: false, error: "Missing project id." };

  const budgetRaw = (formData.get("per_video_budget_usd") as string | null) ?? "";
  const budget = Number(budgetRaw);
  if (!Number.isFinite(budget) || budget <= 0) {
    return { ok: false, error: "Budget must be a positive number." };
  }

  const language = (formData.get("language") as string | null) ?? "";
  if (!VALID_LANGUAGES.has(language)) {
    return { ok: false, error: "Choose a supported language." };
  }

  const targetSecondsRaw = (formData.get("target_seconds") as string | null) ?? "";
  const targetSeconds = Number(targetSecondsRaw);
  if (!Number.isInteger(targetSeconds) || targetSeconds <= 0) {
    return { ok: false, error: "Target seconds must be a positive whole number." };
  }

  const aspectRatio = (formData.get("aspect_ratio") as string | null) ?? "";
  if (!VALID_ASPECTS.has(aspectRatio)) {
    return { ok: false, error: "Choose a supported aspect ratio." };
  }

  const niche = ((formData.get("niche") as string | null) ?? "").trim();

  const autoApprove: Record<string, boolean> = {};
  for (const stage of AUTO_APPROVE_STAGES) {
    autoApprove[stage] = formData.get(`auto_${stage}`) === "on";
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { ok: false, error: "You're not a member of any workspace." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({
      per_video_budget_usd: budget,
      language,
      target_seconds: targetSeconds,
      aspect_ratio: aspectRatio,
      niche: niche || null,
      auto_approve: autoApprove,
    })
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) return { ok: false, error: error.message };

  await logAudit({
    action: "settings.update_project",
    target: `project:${id}`,
    meta: { language, aspect_ratio: aspectRatio, target_seconds: targetSeconds },
    tenantId,
  });

  revalidatePath("/settings");
  return { ok: true };
}

/**
 * Business section: industry, target audience, business goals, content
 * objective. `business_goals`/`content_objective` are also collected during
 * onboarding into `tenant_settings.brand` — this action writes them into
 * `config.business` instead so a later Brand Kit save (which replaces the
 * whole `brand` object, see brand/actions.ts) never silently wipes them.
 */
export async function updateBusinessSettings(formData: FormData): Promise<ActionResult> {
  const gate = await requireEditableTenant();
  if ("error" in gate) return { ok: false, error: gate.error };
  const { tenantId } = gate;

  const industry = str(formData, "industry");
  const targetAudience = str(formData, "target_audience");
  const businessGoals = str(formData, "business_goals");
  const contentObjective = str(formData, "content_objective");

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("tenant_settings")
    .select("audience, config")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const audience = { ...((current?.audience as Record<string, unknown> | null) ?? {}) };
  audience.target_audience = targetAudience || null;

  const config = { ...((current?.config as Record<string, unknown> | null) ?? {}) };
  config.business = {
    ...((config.business as Record<string, unknown> | undefined) ?? {}),
    goals: businessGoals || null,
    objective: contentObjective || null,
  };

  const { error } = await supabase
    .from("tenant_settings")
    .update({ industry: industry || null, audience, config })
    .eq("tenant_id", tenantId);
  if (error) return { ok: false, error: error.message };

  await logAudit({ action: "settings.update_business", target: `tenant_settings:${tenantId}`, tenantId });
  revalidateSettings();
  return { ok: true };
}

const VALID_DATE_FORMATS = new Set(["YYYY-MM-DD", "MM/DD/YYYY", "DD/MM/YYYY", "DD-MM-YYYY"]);

/** Language & Region section: language, secondary language, timezone, country, currency, date format. */
export async function updateRegionSettings(formData: FormData): Promise<ActionResult> {
  const gate = await requireEditableTenant();
  if ("error" in gate) return { ok: false, error: gate.error };
  const { tenantId } = gate;

  const language = str(formData, "language") || "en";
  const secondaryLanguage = str(formData, "secondary_language");
  const timezone = str(formData, "timezone") || "UTC";
  const country = str(formData, "country");
  const currency = str(formData, "currency") || "USD";
  const dateFormat = str(formData, "date_format") || "YYYY-MM-DD";
  if (!VALID_DATE_FORMATS.has(dateFormat)) {
    return { ok: false, error: "Choose a supported date format." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tenant_settings")
    .update({
      language,
      secondary_language: secondaryLanguage || null,
      timezone,
      country: country || null,
      currency,
      date_format: dateFormat,
    })
    .eq("tenant_id", tenantId);
  if (error) return { ok: false, error: error.message };

  await logAudit({ action: "settings.update_region", target: `tenant_settings:${tenantId}`, tenantId });
  revalidateSettings();
  return { ok: true };
}

const VALID_PLATFORMS = new Set([
  "youtube_shorts",
  "youtube_long",
  "tiktok",
  "instagram_reels",
  "multi_platform",
]);

/** Content section: style, tone, keywords, negative keywords, competitors, cadence, target platform. */
export async function updateContentSettings(formData: FormData): Promise<ActionResult> {
  const gate = await requireEditableTenant();
  if ("error" in gate) return { ok: false, error: gate.error };
  const { tenantId } = gate;

  const contentStyle = str(formData, "content_style");
  const tone = str(formData, "tone");
  const uploadFrequency = str(formData, "upload_frequency");
  const targetPlatform = str(formData, "target_platform") || "youtube_shorts";
  if (!VALID_PLATFORMS.has(targetPlatform)) {
    return { ok: false, error: "Choose a supported target platform." };
  }
  const keywords = toArray(formData.get("keywords"));
  const negativeKeywords = toArray(formData.get("negative_keywords"));
  const competitors = toArray(formData.get("competitors"));

  const supabase = await createClient();
  const { error } = await supabase
    .from("tenant_settings")
    .update({
      content_style: contentStyle || null,
      tone: tone || null,
      upload_frequency: uploadFrequency || null,
      target_platform: targetPlatform,
      keywords,
      negative_keywords: negativeKeywords,
      competitors,
    })
    .eq("tenant_id", tenantId);
  if (error) return { ok: false, error: error.message };

  await logAudit({ action: "settings.update_content", target: `tenant_settings:${tenantId}`, tenantId });
  revalidateSettings();
  return { ok: true };
}

/** Voice & AI section: default narration voice, stored in `config.default_voice_id`. */
export async function updateVoiceSettings(formData: FormData): Promise<ActionResult> {
  const gate = await requireEditableTenant();
  if ("error" in gate) return { ok: false, error: gate.error };
  const { tenantId } = gate;

  const defaultVoiceId = str(formData, "default_voice_id");

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("tenant_settings")
    .select("config")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const config = { ...((current?.config as Record<string, unknown> | null) ?? {}) };
  config.default_voice_id = defaultVoiceId || null;

  const { error } = await supabase.from("tenant_settings").update({ config }).eq("tenant_id", tenantId);
  if (error) return { ok: false, error: error.message };

  await logAudit({
    action: "settings.update_voice",
    target: `tenant_settings:${tenantId}`,
    meta: { default_voice_id: defaultVoiceId || null },
    tenantId,
  });
  revalidateSettings();
  return { ok: true };
}

/** Notifications section: email preferences, stored in `config.notifications`. */
export async function updateNotificationSettings(formData: FormData): Promise<ActionResult> {
  const gate = await requireEditableTenant();
  if ("error" in gate) return { ok: false, error: gate.error };
  const { tenantId } = gate;

  const notifications = {
    on_publish: formData.get("on_publish") === "on",
    on_approval_needed: formData.get("on_approval_needed") === "on",
    on_failure: formData.get("on_failure") === "on",
  };

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("tenant_settings")
    .select("config")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const config = { ...((current?.config as Record<string, unknown> | null) ?? {}), notifications };

  const { error } = await supabase.from("tenant_settings").update({ config }).eq("tenant_id", tenantId);
  if (error) return { ok: false, error: error.message };

  await logAudit({
    action: "settings.update_notifications",
    target: `tenant_settings:${tenantId}`,
    meta: notifications,
    tenantId,
  });
  revalidateSettings();
  return { ok: true };
}
