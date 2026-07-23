/**
 * Deterministic-shaped MOCK story + scene generator. $0 — no AI / paid API
 * calls. Used by the /generate "AI Content Generator" page to create a
 * draft story (and its scene breakdown) instantly, the same way
 * `src/lib/planner/mock-plan.ts` mocks a 30-day plan.
 *
 * Real AI-researched script/scene generation is a paid pipeline stage,
 * gated for a later phase (see src/lib/pipeline/stage-content.ts).
 */

import { simpleHash } from "@/lib/planner/mock-plan";

export interface MockStorySettings {
  niche?: string | null;
  language?: string | null;
  targetSeconds?: number | null;
  industry?: string | null;
  keywords?: string[] | null;
}

const TOPIC_BANK = [
  "The Clever Fox and the Drum",
  "The Farmer and the Golden Goose",
  "The Ant and the Grasshopper, Revisited",
  "The Thirsty Crow's Clever Trick",
  "The Tortoise Who Outsmarted the Hare",
  "The Monkey and the Crocodile",
  "The Lion, the Mouse, and the Hunter's Net",
  "The Foolish Merchant and the Wise Old Owl",
  "The Elephant and the Six Blind Men",
  "The Woodcutter's Honest Wish",
  "The Talking Cave",
  "The Turtle and the Geese",
  "The Wise Minister's Riddle",
  "The Milkmaid and Her Pail of Dreams",
  "The Peacock Who Envied the Swan",
  "The Snake and the Garland of Flowers",
  "The King Who Learned to Listen",
  "The Farmer's Three Sons and the Bundle of Sticks",
  "The Crow and the Pitcher of Water",
  "The Shepherd Boy Who Cried Wolf",
];

const MORAL_BANK = [
  "Cleverness without kindness is hollow.",
  "Patience quietly beats speed.",
  "Honesty is remembered long after the moment passes.",
  "Small acts of kindness return in unexpected ways.",
  "Greed empties the hand that grips too tightly.",
  "True strength is knowing when to listen.",
  "A united front outlasts any single strong branch.",
  "What you give freely often comes back tenfold.",
];

const CAMERA_BANK = ["Wide establishing shot", "Slow push-in", "Over-the-shoulder", "Low angle", "Close-up on face", "Tracking shot"];
const LIGHTING_BANK = ["Golden hour warmth", "Soft overcast diffusion", "Moonlit blue tones", "Dawn mist glow", "Firelit amber"];
const EMOTION_BANK = ["Curiosity", "Quiet tension", "Warm relief", "Playful mischief", "Solemn realization", "Joyful triumph"];
const ENVIRONMENT_BANK = ["Sun-dappled forest clearing", "Riverside village", "Mountain path at dusk", "Royal courtyard", "Quiet farmland", "Ancient banyan tree"];

export interface MockScenePromptDraft {
  camera: string;
  lighting: string;
  emotion: string;
  environment: string;
}

export interface MockSceneDraft {
  seq: number;
  start_sec: number;
  end_sec: number;
  narration: string;
  subtitle: string;
  importance: "HIGH" | "MEDIUM" | "LOW";
  motion_type: string;
  recommended_quality: string;
  animate: boolean;
  prompt: MockScenePromptDraft;
}

export interface MockStoryDraft {
  topic: string;
  logline: string;
  moral: string;
  duration_seconds: number;
  beat_sheet: {
    // "generated_mock" = the deterministic $0 draft; "ai_generated" = a real
    // LLM story via the live gateway. Kept honest so provenance is never blurred.
    source: "generated_mock" | "ai_generated";
    characters_used: string[];
    seo: { title: string; description: string; tags: string[] };
    mock: boolean;
    model?: string;
    provider?: string;
    generatedAt: string;
  };
  scenes: MockSceneDraft[];
}

const NARRATION_TEMPLATES = [
  (topic: string) => `Long ago, near a quiet village, began the story of ${topic.toLowerCase()}.`,
  () => "Every creature in the forest gathered to watch what would happen next.",
  () => "But not everything was as it first appeared.",
  () => "A choice had to be made — and there was no easy answer.",
  () => "In that moment, courage mattered more than cleverness.",
  () => "Word of what happened spread from village to village.",
  (topic: string, moral: string) => `And so, from the tale of ${topic.toLowerCase()}, one lesson remained: ${moral.toLowerCase()}`,
];

export interface GenerateMockStoryOptions {
  tenantId: string;
  topicInput?: string | null;
  useNiche?: boolean;
  settings: MockStorySettings | null;
}

/** Builds a full mock story draft (logline, moral, SEO, and a scene
 * breakdown) — pure function, $0, no I/O. */
export function generateMockStory(options: GenerateMockStoryOptions): MockStoryDraft {
  const { tenantId, topicInput, settings } = options;
  const seed = simpleHash(`${tenantId}:${Date.now()}:${topicInput ?? ""}`);

  const targetSeconds = settings?.targetSeconds ?? 45;
  const keywords = (settings?.keywords ?? []).filter(Boolean);

  const trimmedTopic = topicInput?.trim();
  const baseTopic = trimmedTopic || TOPIC_BANK[seed % TOPIC_BANK.length];
  const topic =
    !trimmedTopic && keywords.length > 0
      ? `${baseTopic} — ${keywords[seed % keywords.length]} angle`
      : baseTopic;

  const moral = MORAL_BANK[seed % MORAL_BANK.length];
  const logline = `A short moral tale about ${topic
    .replace(/^The\s+/i, "")
    .toLowerCase()} — ${moral.toLowerCase()}`;

  const sceneCount = Math.max(4, Math.min(8, Math.round(targetSeconds / 8)));
  const sceneLength = targetSeconds / sceneCount;

  const scenes: MockSceneDraft[] = Array.from({ length: sceneCount }, (_, i) => {
    const s = seed + i * 17;
    const template = NARRATION_TEMPLATES[i % NARRATION_TEMPLATES.length];
    const narration = template(topic, moral);
    const importance: MockSceneDraft["importance"] =
      i === 0 || i === sceneCount - 1 ? "HIGH" : i % 3 === 0 ? "MEDIUM" : "LOW";

    return {
      seq: i + 1,
      start_sec: Number((i * sceneLength).toFixed(1)),
      end_sec: Number(((i + 1) * sceneLength).toFixed(1)),
      narration,
      subtitle: narration,
      importance,
      motion_type: importance === "HIGH" ? "ai_animation" : importance === "MEDIUM" ? "ken_burns" : "static",
      recommended_quality: importance === "HIGH" ? "High" : importance === "MEDIUM" ? "Medium" : "Low",
      animate: importance === "HIGH",
      prompt: {
        camera: CAMERA_BANK[s % CAMERA_BANK.length],
        lighting: LIGHTING_BANK[s % LIGHTING_BANK.length],
        emotion: EMOTION_BANK[s % EMOTION_BANK.length],
        environment: ENVIRONMENT_BANK[s % ENVIRONMENT_BANK.length],
      },
    };
  });

  return {
    topic,
    logline,
    moral,
    duration_seconds: targetSeconds,
    beat_sheet: {
      source: "generated_mock",
      characters_used: ["Narrator (Host)"],
      seo: {
        title: `${topic} | #Shorts`,
        description: logline,
        tags: ["moral stories", "shorts", "animated shorts", "bedtime story", ...(keywords.slice(0, 3))],
      },
      mock: true,
      generatedAt: new Date().toISOString(),
    },
    scenes,
  };
}
