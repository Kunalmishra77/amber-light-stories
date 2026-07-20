import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/ops/audit";
import { notify } from "@/lib/ops/notify";
import { generateMockStory, type MockStorySettings } from "@/lib/generate/mock-story";
import { getStagePreview, STAGE_ORDER } from "@/lib/pipeline/stage-content";
import { getTenantBrand } from "@/lib/branding";
import { PROVIDER_REGISTRY, type ProviderKey } from "@/lib/providers/registry";
import { checkGenerationQuota, QuotaExceededError } from "@/lib/ops/entitlements";
import { dispatchEvent } from "@/lib/webhooks/dispatch";
import { selectProvider } from "@/lib/ai-gateway/selection";
import { LiveGenerationDisabledError } from "@/lib/ai-gateway/types";

/**
 * Generation execution seam (M4 — closes the dashboard ↔ engine loop for
 * ISS-A2). The web app invokes THIS, not a bare mock: it resolves the LLM
 * provider + per-tenant credential via the M3 seam (registry + Vault, never a
 * global .env key), then runs the pipeline lifecycle (stories/scenes/
 * pipeline_runs/pipeline_stages) that the review board at /pipeline consumes.
 *
 * Execution mode:
 *  - "dry"  (default): $0, deterministic — the dry-run adapter. Produces real,
 *            reviewable DB state without any paid provider call.
 *  - "live" (paid): the STABLE EXTENSION POINT for real provider adapters.
 *            Deliberately CLOSED (throws) until the owner explicitly authorizes
 *            paid runs (Product Bible Part 1). This is not a temporary hack —
 *            it is the single, well-defined door real adapters plug into,
 *            already wired to the correct per-tenant credential resolution.
 */
export type GenerationMode = "dry" | "live";

// The live-gate error now has a single definition in the AI Gateway
// (ISS-P2-06). Re-exported here so existing callers keep importing it.
export { LiveGenerationDisabledError };

/** Preferred LLM providers for story generation (the "text" capability), in
 * order. Selection/routing itself is centralized in the AI Gateway. */
const LLM_PREFERENCE: ProviderKey[] = ["openai", "gemini"];

export interface ResolvedGenerationProvider {
  provider: ProviderKey;
  hasCredential: boolean;
}

/**
 * Resolve the LLM provider + whether the tenant has a credential for it, via
 * the M3 per-tenant Vault seam. Picks the first configured provider, else the
 * default (so dry runs still work before any key is connected).
 */
export async function resolveGenerationProvider(
  tenantId: string
): Promise<ResolvedGenerationProvider> {
  // Delegate to the AI Gateway's central selection (registry + credential seam
  // + failover ordering) — one routing path, no duplicate provider logic.
  const selection = await selectProvider({
    capability: "text",
    tenantId,
    preferenceOrder: LLM_PREFERENCE,
  });
  const primary = selection.candidates.find((c) => c.provider === selection.primary);
  return {
    provider: selection.primary ?? "openai",
    hasCredential: primary?.hasCredential ?? false,
  };
}

export interface RunStoryGenerationInput {
  tenantId: string;
  topicInput: string | null;
  settings: MockStorySettings;
  /** The tenant's project this story belongs to (nullable). */
  projectId?: string | null;
  /** Per-video budget for the run (defaults to the platform cap). */
  perVideoBudgetUsd?: number | null;
  mode?: GenerationMode;
  /** Supabase client to write with. Defaults to the authed request client
   * (interactive /generate). The scheduler runner passes the service-role
   * client so it can run without a user session (M5). Rows are tenant-scoped
   * either way (tenant_id is set explicitly). */
  client?: SupabaseClient;
}

export interface RunStoryGenerationResult {
  storyId: string;
  provider: ProviderKey;
  mode: GenerationMode;
}

/**
 * Run one story through the generation pipeline and persist its reviewable
 * state. Returns the new story id (the caller handles revalidate/redirect).
 */
export async function runStoryGeneration(
  input: RunStoryGenerationInput
): Promise<RunStoryGenerationResult> {
  const { tenantId, topicInput, settings } = input;
  const mode: GenerationMode = input.mode ?? "dry";

  // Resolve provider + credential through the M3 seam (registry + Vault).
  const resolved = await resolveGenerationProvider(tenantId);

  // LIVE = the gated extension point. Real provider adapters plug in here,
  // reading the key via getTenantCredential(tenantId, resolved.provider).
  if (mode === "live") {
    throw new LiveGenerationDisabledError();
  }

  const supabase = input.client ?? (await createClient());

  // Enforce the tenant's plan quota BEFORE generating (ADR-004 / ISS-B4).
  const quota = await checkGenerationQuota(tenantId, supabase);
  if (!quota.allowed) {
    throw new QuotaExceededError(quota.reason ?? "Monthly generation limit reached.");
  }

  // DRY ($0): deterministic generator = the dry-run adapter output.
  const draft = generateMockStory({ tenantId, topicInput, settings });

  const { data: story, error: storyError } = await supabase
    .from("stories")
    .insert({
      tenant_id: tenantId,
      project_id: input.projectId ?? null,
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
    throw new Error(storyError?.message ?? "Couldn't create the story.");
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
  if (scenesError) throw new Error(scenesError.message);

  const { data: run, error: runError } = await supabase
    .from("pipeline_runs")
    .insert({
      tenant_id: tenantId,
      story_id: story.id,
      status: "running",
      current_stage: "research",
      total_cost_usd: 0,
      budget_usd: input.perVideoBudgetUsd ?? 1.55,
    })
    .select("id")
    .single();
  if (runError || !run) {
    throw new Error(runError?.message ?? "Couldn't start the pipeline run.");
  }

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

  // Record which provider WOULD serve this run + the execution mode, on the
  // gate stage's output — so /pipeline shows the resolved provider and $0.
  // Tenant brand for SEO/preview text — never a hardcoded client name (ISS-D4).
  const brandName = (await getTenantBrand(tenantId)).display_name;

  const generationMeta = {
    provider: resolved.provider,
    providerLabel: PROVIDER_REGISTRY[resolved.provider].label,
    hasCredential: resolved.hasCredential,
    mode,
  };

  const stageRows = STAGE_ORDER.map((stage, i) => {
    const isFirst = i === 0;
    const isSecond = i === 1;
    const status = isFirst ? "done" : isSecond ? "awaiting_review" : "pending";
    const output =
      isFirst || isSecond
        ? {
            ...getStagePreview(stage, storyForContent, scenesForContent, brandName),
            generatedAt: new Date().toISOString(),
            generation: generationMeta,
          }
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
  if (stagesError) throw new Error(stagesError.message);

  await logAudit({
    action: "generate.run_story",
    target: `story:${story.id}`,
    meta: { topic: draft.topic, mode, provider: resolved.provider },
    tenantId,
  });
  await notify({
    tenantId,
    kind: "story_generated",
    title: "New draft story generated",
    body: `"${draft.topic}" is ready for review — $0, ${mode}-run via ${PROVIDER_REGISTRY[resolved.provider].label}.`,
  });

  // Emit a signed webhook to any tenant endpoints subscribed to this event
  // (M8/P2-12). Never throws — dispatch is fully fire-and-forget safe.
  await dispatchEvent({
    tenantId,
    eventType: "story.generated",
    data: { story_id: story.id, topic: draft.topic, provider: resolved.provider, mode },
  });

  return { storyId: story.id, provider: resolved.provider, mode };
}
