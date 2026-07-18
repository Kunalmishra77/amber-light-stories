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

/** Canonical 20-stage pipeline order (matches `pipeline_stages.seq`). */
export const STAGE_ORDER = [
  "topic",
  "research",
  "script",
  "storyboard",
  "scene_breakdown",
  "character_assignment",
  "scene_prompt_generation",
  "keyframe_images",
  "motion_clips",
  "voice",
  "background_music",
  "sound_effects",
  "subtitles",
  "transitions",
  "render",
  "thumbnail",
  "metadata",
  "human_review",
  "schedule",
  "publish",
] as const;

export type StageName = (typeof STAGE_ORDER)[number];

export const STAGE_LABELS: Record<StageName, string> = {
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

function seoFallback(story: StoryForContent): { title: string; description: string; tags: string[] } {
  const topic = story.topic?.trim() || "Untitled Story";
  return {
    title: `${topic} | Amber Light Stories #Shorts`,
    description:
      story.logline?.trim() ||
      `${topic} — an original moral short from Amber Light Stories.`,
    tags: [
      "moral stories",
      "panchatantra",
      "shorts",
      "amber light stories",
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
  scenes: SceneForContent[]
): StagePreview {
  const stageName = stage as StageName;

  if (isPaidStage(stageName)) {
    return gatedPreview(stageName);
  }

  const ordered = sortedScenes(scenes);

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
      const seo = beatSheet.seo ?? seoFallback(story);
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
