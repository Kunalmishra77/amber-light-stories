/**
 * Pure, deterministic stage-output preview generator.
 *
 * Given a stage name + the story/scenes rows already loaded from Supabase,
 * returns a human-readable preview of what that stage's output would look
 * like. No network calls, no paid APIs — everything here is derived from
 * data already sitting in the `stories` / `scenes` tables.
 *
 * "Money" stages (image/video/voice/audio/render generation) return a
 * gated placeholder instead of real content, since those only run in
 * Phase 5 with explicit paid-run permission.
 */

export interface StoryForContent {
  id: string;
  topic: string | null;
  logline: string | null;
  moral: string | null;
  duration_seconds: number | null;
  beat_sheet: Record<string, unknown> | null;
}

export interface ScenePromptForContent {
  subject?: string;
  environment?: string;
  camera?: string;
  lens?: string;
  lighting?: string;
  color_grade?: string;
  expression?: string;
  emotion?: string;
  motion_direction?: string;
  sfx_cue?: string;
  music_cue?: string;
  asset_query?: string;
  animation_required?: boolean;
}

export interface SceneForContent {
  id: string;
  seq: number | null;
  start_sec: number | null;
  end_sec: number | null;
  narration: string | null;
  subtitle: string | null;
  importance: string | null;
  motion_type: string | null;
  recommended_quality: string | null;
  animate: boolean | null;
  prompt: ScenePromptForContent | null;
}

/**
 * Canonical pipeline order (matches `pipeline_stages.seq`). Expanded in M12 G6
 * to the full idea→publish shape. Existing runs are unaffected: advancement
 * uses the stored `seq`, so runs created under the previous 20-stage order
 * continue to completion unchanged.
 *
 * Three stage classes:
 *   - free/planning  — real, deterministic previews
 *   - PAID_STAGES    — metered provider work, never auto-run (Part 1)
 *   - GATED_STAGES   — real intelligence that needs an external dependency or
 *                      paid AI that is NOT yet authorized. These are explicitly
 *                      deferred and marked `skipped` with the exact reason.
 *                      They NEVER fabricate intelligence.
 */
export const STAGE_ORDER = [
  "strategy",
  "trend",
  "competitor",
  "topic",
  "research",
  "fact_verify",
  "script",
  "story_enhance",
  "storyboard",
  "scene_breakdown",
  "character_assignment",
  "scene_prompt_generation",
  "quality_gate",
  "keyframe_images",
  "motion_clips",
  "voice",
  "background_music",
  "sound_effects",
  "subtitles",
  "transitions",
  "compliance_pre_render",
  "render",
  "thumbnail",
  "metadata",
  "compliance_pre_publish",
  "human_review",
  "schedule",
  "publish",
  "learning",
] as const;

export type StageName = (typeof STAGE_ORDER)[number];

export const STAGE_LABELS: Record<StageName, string> = {
  strategy: "Strategy",
  trend: "Trend Signals",
  competitor: "Competitor Signals",
  fact_verify: "Fact Verification",
  story_enhance: "Story Enhancement",
  quality_gate: "Quality Gate",
  compliance_pre_render: "Compliance (pre-render)",
  compliance_pre_publish: "Compliance (pre-publish)",
  learning: "Learning",
  topic: "Topic",
  research: "Research",
  script: "Script",
  storyboard: "Storyboard",
  scene_breakdown: "Scene Breakdown",
  character_assignment: "Character Assignment",
  scene_prompt_generation: "Scene Prompts",
  keyframe_images: "Keyframe Images",
  motion_clips: "Motion Clips",
  voice: "Voice",
  background_music: "Background Music",
  sound_effects: "Sound Effects",
  subtitles: "Subtitles",
  transitions: "Transitions",
  render: "Render",
  thumbnail: "Thumbnail",
  metadata: "Metadata / SEO",
  human_review: "Human Review",
  schedule: "Schedule",
  publish: "Publish",
};

/**
 * "Money" stages — anything that would call a paid generation API (fal,
 * ElevenLabs, render compute, etc). These never auto-run; they only ever
 * become real once Phase 5 grants explicit paid-run permission.
 */
export const PAID_STAGES = new Set<StageName>([
  "keyframe_images",
  "motion_clips",
  "voice",
  "background_music",
  "sound_effects",
  "subtitles",
  "transitions",
  "render",
  "thumbnail",
]);

export function isPaidStage(stage: string): boolean {
  return PAID_STAGES.has(stage as StageName);
}

/**
 * EXECUTION-GATED stages (M12 G6). These are real pipeline stages whose
 * intelligence depends on an external dependency or paid AI that is not yet
 * authorized. They are explicitly deferred — marked `skipped` with the exact
 * blocking dependency — and MUST NOT fabricate intelligence. Each entry names
 * precisely what must be provided to activate it.
 */
export const GATED_STAGES: Partial<Record<StageName, { requires: string; backlogItem: string }>> = {
  trend: {
    requires: "a live trend-data provider (external API credential + authorization)",
    backlogItem: "ISS-P6-R1-05",
  },
  competitor: {
    requires: "a live competitor-analytics source (external API credential + authorization)",
    backlogItem: "ISS-P6-R1-05",
  },
  fact_verify: {
    requires: "the Knowledge/RAG index (paid embeddings + pgvector) — deferred",
    backlogItem: "ISS-P6-R1-03",
  },
  story_enhance: {
    requires: "authorized paid AI generation (owner approval for metered runs)",
    backlogItem: "ISS-P6-01",
  },
  learning: {
    requires: "live YouTube Analytics data (OAuth) — sample data is never learned from",
    backlogItem: "ISS-P6-R1-08",
  },
};

export function isGatedStage(stage: string): boolean {
  return Object.prototype.hasOwnProperty.call(GATED_STAGES, stage);
}

export function gatedStageReason(stage: string): string | null {
  const g = GATED_STAGES[stage as StageName];
  return g ? `Execution-gated: requires ${g.requires} (${g.backlogItem}).` : null;
}

export function stageSeq(stage: string): number {
  return STAGE_ORDER.indexOf(stage as StageName);
}

export function stageLabel(stage: string): string {
  return STAGE_LABELS[stage as StageName] ?? stage;
}

export interface StageSection {
  label: string;
  value: string;
}

export interface StagePreview {
  stage: string;
  title: string;
  paid: boolean;
  /** One-line summary shown in compact contexts. */
  summary: string;
  sections: StageSection[];
}

function sortedScenes(scenes: SceneForContent[]): SceneForContent[] {
  return [...scenes].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
}

function formatTimeRange(scene: SceneForContent): string {
  const s = scene.start_sec ?? 0;
  const e = scene.end_sec ?? 0;
  return `${s.toFixed(1)}s–${e.toFixed(1)}s`;
}

function gatedPreview(stage: StageName): StagePreview {
  return {
    stage,
    title: stageLabel(stage),
    paid: true,
    summary: "Paid generation stage — not yet run.",
    sections: [
      {
        label: "Status",
        value:
          "⚡ Paid generation stage — runs only at Phase 5 with explicit permission.\n\n" +
          "This stage calls a metered external API (image/video/voice generation, " +
          "audio mixing, or render compute). No cost is incurred until a real, " +
          "explicitly-approved paid run is triggered.",
      },
    ],
  };
}

/**
 * Preview for an EXECUTION-GATED stage. States exactly what is missing and
 * what would activate it. It deliberately contains NO invented intelligence —
 * an ungated implementation replaces this with real provider output.
 */
function executionGatedPreview(stage: StageName): StagePreview {
  const gate = GATED_STAGES[stage];
  return {
    stage,
    title: stageLabel(stage),
    paid: false,
    summary: "Execution-gated — deferred until its dependency is authorized.",
    sections: [
      {
        label: "Status",
        value:
          `⏸ This stage is DEFERRED. It requires ${gate?.requires ?? "an external dependency"}.\n\n` +
          "No output is produced and nothing is inferred: presenting simulated trends, " +
          "competitor data, fact-checks or learning as real intelligence would be misleading. " +
          "The stage is skipped with this reason recorded, and the run continues.",
      },
      { label: "Tracked as", value: gate?.backlogItem ?? "—" },
    ],
  };
}

function seoFallback(
  story: StoryForContent,
  brandName: string
): { title: string; description: string; tags: string[] } {
  const topic = story.topic?.trim() || "Untitled Story";
  const brand = brandName?.trim() || "your channel";
  return {
    title: `${topic} | ${brand} #Shorts`,
    description:
      story.logline?.trim() || `${topic} — an original moral short from ${brand}.`,
    tags: [
      "moral stories",
      "panchatantra",
      "shorts",
      brand.toLowerCase(),
      "animated shorts",
      "bedtime story",
    ],
  };
}

function detectCharactersInScene(
  scene: SceneForContent,
  cast: string[]
): string[] {
  const haystack = [
    scene.narration ?? "",
    scene.prompt?.subject ?? "",
    scene.prompt?.expression ?? "",
  ]
    .join(" ")
    .toLowerCase();

  const found = cast.filter((name) => {
    const bare = name.replace(/\s*\(.*?\)\s*/g, "").trim().toLowerCase();
    return bare && haystack.includes(bare);
  });

  return found.length > 0 ? found : ["Narrator (Host)"];
}

/**
 * Returns the freshly-generated (deterministic, $0) preview for a stage.
 * This is what gets stored into `pipeline_stages.output` when a
 * free/planning stage is advanced into via approveStage / regenerateStage.
 */
export function getStagePreview(
  stage: string,
  story: StoryForContent,
  scenes: SceneForContent[],
  brandName: string = "your channel"
): StagePreview {
  const stageName = stage as StageName;

  if (isPaidStage(stageName)) {
    return gatedPreview(stageName);
  }

  // Execution-gated intelligence: state the blocking dependency plainly.
  // Never emit invented trends/competitors/facts/learning.
  if (isGatedStage(stageName)) {
    return executionGatedPreview(stageName);
  }

  const ordered = sortedScenes(scenes);

  switch (stageName) {
    case "strategy": {
      // Real: derived from the story + calendar context already in hand.
      return {
        stage: stageName,
        title: "Strategy",
        paid: false,
        summary: story.topic?.trim() || "Content strategy for this run",
        sections: [
          { label: "Angle", value: story.logline?.trim() || "—" },
          { label: "Takeaway", value: story.moral?.trim() || "—" },
          {
            label: "Note",
            value:
              "Strategy is derived from the workspace calendar, brand and content memory. " +
              "Trend and competitor signals are separate, execution-gated stages.",
          },
        ],
      };
    }

    case "quality_gate":
    case "compliance_pre_render":
    case "compliance_pre_publish": {
      // These stages are evaluated by the rules engines at runtime; the stored
      // output is written by the gate itself. This preview describes the gate.
      const isQuality = stageName === "quality_gate";
      return {
        stage: stageName,
        title: stageLabel(stageName),
        paid: false,
        summary: isQuality
          ? "Rules-based quality scoring across weighted dimensions."
          : "Rules-based compliance & safety gate.",
        sections: [
          {
            label: "Evaluator",
            value: isQuality
              ? "Deterministic rules over the real script/scene/format data (script completeness, scene coverage, duration fit, SEO, brand alignment, continuity, safety). A pluggable AI-evaluator tier is a later authorized addition."
              : "Deterministic policy rules (unsafe content, audience strictness, likeness consent, asset licensing, publish metadata). An AI classifier tier is a later authorized addition.",
          },
          {
            label: "Outcome",
            value: isQuality
              ? "Passing proceeds; a scene-local failure triggers the narrowest regeneration; a blocking dimension forces manual review."
              : "Blocking findings stop the run and notify; warnings require manual review.",
          },
        ],
      };
    }
  }

  switch (stageName) {
    case "topic": {
      const topic = story.topic?.trim() || "Untitled story";
      return {
        stage: stageName,
        title: "Topic",
        paid: false,
        summary: topic,
        sections: [{ label: "Story topic", value: topic }],
      };
    }

    case "research": {
      return {
        stage: stageName,
        title: "Research",
        paid: false,
        summary: story.logline?.trim() || "No logline captured.",
        sections: [
          { label: "Logline", value: story.logline?.trim() || "—" },
          { label: "Moral", value: story.moral?.trim() || "—" },
        ],
      };
    }

    case "script": {
      const narration = ordered
        .map((s) => s.narration?.trim())
        .filter((n): n is string => Boolean(n))
        .join("\n\n");

      const beatSummary = ordered
        .map((s) => {
          const beat = s.narration
            ? s.narration.split(" ").slice(0, 8).join(" ") +
              (s.narration.split(" ").length > 8 ? "…" : "")
            : "—";
          return `Scene ${s.seq ?? "?"} (${formatTimeRange(s)}) — ${beat}`;
        })
        .join("\n");

      return {
        stage: stageName,
        title: "Script",
        paid: false,
        summary: `${ordered.length} scenes · ${
          story.duration_seconds ?? "?"
        }s runtime`,
        sections: [
          { label: "Full narration", value: narration || "No narration written yet." },
          { label: "Beat summary", value: beatSummary || "—" },
        ],
      };
    }

    case "storyboard":
    case "scene_breakdown": {
      const list = ordered
        .map((s) => {
          const p = s.prompt ?? {};
          const bits = [
            p.camera ? `Camera: ${p.camera}` : null,
            p.environment ? `Setting: ${p.environment}` : null,
            p.emotion ? `Mood: ${p.emotion}` : null,
          ]
            .filter(Boolean)
            .join(" · ");
          return `Scene ${s.seq ?? "?"} (${formatTimeRange(s)})${
            bits ? ` — ${bits}` : ""
          }`;
        })
        .join("\n");

      return {
        stage: stageName,
        title: stageLabel(stageName),
        paid: false,
        summary: `${ordered.length} scenes storyboarded`,
        sections: [{ label: "Scene list", value: list || "No scenes yet." }],
      };
    }

    case "character_assignment": {
      const beatSheet = (story.beat_sheet ?? {}) as {
        characters_used?: string[];
      };
      const cast = beatSheet.characters_used ?? [];

      const perScene = ordered
        .map((s) => {
          const characters = detectCharactersInScene(s, cast);
          return `Scene ${s.seq ?? "?"} (${formatTimeRange(s)}) — ${characters.join(", ")}`;
        })
        .join("\n");

      return {
        stage: stageName,
        title: "Character Assignment",
        paid: false,
        summary: cast.length > 0 ? `Cast: ${cast.join(", ")}` : "No cast recorded",
        sections: [
          { label: "Cast", value: cast.length > 0 ? cast.join(", ") : "—" },
          { label: "Per-scene assignment", value: perScene || "—" },
        ],
      };
    }

    case "scene_prompt_generation": {
      const list = ordered
        .map((s) => {
          const p = s.prompt ?? {};
          const lines = [
            p.camera ? `  Camera: ${p.camera}` : null,
            p.lens ? `  Lens: ${p.lens}` : null,
            p.lighting ? `  Lighting: ${p.lighting}` : null,
            p.color_grade ? `  Color: ${p.color_grade}` : null,
            p.emotion ? `  Emotion: ${p.emotion}` : null,
          ].filter(Boolean);
          return `Scene ${s.seq ?? "?"}:\n${lines.join("\n") || "  —"}`;
        })
        .join("\n\n");

      return {
        stage: stageName,
        title: "Scene Prompts",
        paid: false,
        summary: `${ordered.length} prompts generated`,
        sections: [{ label: "Per-scene prompts", value: list || "—" }],
      };
    }

    case "metadata": {
      const beatSheet = (story.beat_sheet ?? {}) as {
        seo?: { title?: string; description?: string; tags?: string[] };
      };
      const seo = beatSheet.seo ?? seoFallback(story, brandName);
      return {
        stage: stageName,
        title: "Metadata / SEO",
        paid: false,
        summary: seo.title ?? story.topic ?? "—",
        sections: [
          { label: "Title", value: seo.title ?? "—" },
          { label: "Description", value: seo.description ?? "—" },
          {
            label: "Tags",
            value: seo.tags && seo.tags.length > 0 ? seo.tags.join(", ") : "—",
          },
        ],
      };
    }

    case "human_review": {
      return {
        stage: stageName,
        title: "Human Review",
        paid: false,
        summary: "Final human sign-off before scheduling.",
        sections: [
          {
            label: "Checklist",
            value:
              "• Narration reads naturally end-to-end\n" +
              "• Scene pacing matches target duration\n" +
              "• Moral / CTA lands clearly\n" +
              "• No factual or cultural inaccuracies",
          },
        ],
      };
    }

    case "schedule": {
      return {
        stage: stageName,
        title: "Schedule",
        paid: false,
        summary: "Ready to be queued for a publish slot.",
        sections: [
          {
            label: "Publish window",
            value: "Not yet scheduled — set a publish date/time once approved.",
          },
        ],
      };
    }

    case "publish": {
      return {
        stage: stageName,
        title: "Publish",
        paid: false,
        summary: "Final publish to YouTube.",
        sections: [
          {
            label: "Status",
            value: "Awaiting upstream stages — nothing to publish yet.",
          },
        ],
      };
    }

    default:
      return gatedPreview(stageName);
  }
}
