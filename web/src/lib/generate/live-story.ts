import "server-only";
import { runThroughGateway } from "@/lib/ai-gateway/gateway";
import type { TextGenerationInput, TextGenerationOutput } from "@/lib/ai-gateway/adapters/text";
import type { ProviderKey } from "@/lib/providers/registry";
import type { MockStoryDraft, MockStorySettings } from "@/lib/generate/mock-story";

/**
 * Real, AI-generated story + scene breakdown (Priority 5).
 *
 * Produces the SAME `MockStoryDraft` shape the deterministic generator does, so
 * every downstream consumer (stories/scenes/pipeline_runs/pipeline_stages, the
 * review board, the quality gate) is unchanged — only the source of the content
 * differs. The LLM call goes through the AI Gateway, so it inherits provider
 * selection, the tenant credential resolution, retry/timeout and cost recording.
 *
 * This never falls back to mock data: if the model call or its JSON fails, it
 * throws, and the caller surfaces the failure. A run either used real AI or it
 * did not — it is never quietly faked.
 */

export interface LiveStoryInput {
  tenantId: string;
  topicInput: string | null;
  settings: MockStorySettings;
  targetSeconds: number;
  sceneBudget: number;
  brandName: string;
  preferenceOrder: ProviderKey[];
}

interface LlmScene {
  narration?: string;
  subtitle?: string;
  importance?: string;
  visual?: string;
  camera?: string;
  lighting?: string;
  emotion?: string;
  environment?: string;
}

interface LlmStory {
  topic?: string;
  logline?: string;
  moral?: string;
  characters?: string[];
  seo?: { title?: string; description?: string; tags?: string[] };
  scenes?: LlmScene[];
}

const SYSTEM = [
  "You are a professional short-form video scriptwriter for an automated YouTube studio.",
  "You write concise, engaging narration for short animated story videos.",
  "You always respond with a single valid JSON object and nothing else.",
].join(" ");

function buildPrompt(input: LiveStoryInput): string {
  const s = input.settings;
  const niche = s.niche || s.industry || "short educational stories and fables";
  const language = s.language || "English";
  const keywords = (s.keywords ?? []).filter(Boolean).join(", ");

  return [
    `Create a short video story for the workspace "${input.brandName}".`,
    input.topicInput ? `Topic: ${input.topicInput}.` : `Pick a fresh topic in this niche: ${niche}.`,
    `Language: ${language}.`,
    `Target length: about ${input.targetSeconds} seconds.`,
    `Break it into exactly ${input.sceneBudget} scenes that together tell one complete story.`,
    keywords ? `Weave in these themes where natural: ${keywords}.` : "",
    "",
    "Respond with a JSON object with EXACTLY these fields:",
    "{",
    '  "topic": string (a short title),',
    '  "logline": string (one sentence),',
    '  "moral": string (the lesson in one short sentence),',
    '  "characters": string[] (named characters used),',
    '  "seo": { "title": string (<=100 chars), "description": string, "tags": string[] },',
    `  "scenes": array of exactly ${input.sceneBudget} objects, each:`,
    '    { "narration": string (1-2 spoken sentences), "subtitle": string (short on-screen caption),',
    '      "importance": "HIGH"|"MEDIUM"|"LOW", "camera": string, "lighting": string,',
    '      "emotion": string, "environment": string }',
    "}",
    "Do not include any text outside the JSON object.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Best-effort JSON extraction — models occasionally wrap JSON in prose/fences. */
function parseStoryJson(text: string): LlmStory {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(trimmed) as LlmStory;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as LlmStory;
    }
    throw new Error("The model did not return valid JSON.");
  }
}

const IMPORTANCE = new Set(["HIGH", "MEDIUM", "LOW"]);

export async function generateLiveStory(input: LiveStoryInput): Promise<MockStoryDraft> {
  const request = {
    capability: "text" as const,
    tenantId: input.tenantId,
    mode: "live" as const,
    input: {
      system: SYSTEM,
      prompt: buildPrompt(input),
      json: true,
      maxTokens: 2200,
      temperature: 0.85,
    } satisfies TextGenerationInput,
    stage: "script",
    preferenceOrder: input.preferenceOrder,
  };

  const response = await runThroughGateway<TextGenerationOutput>(request);
  const story = parseStoryJson(response.output.text);
  const model = response.output.model;
  const provider = response.output.provider;

  const rawScenes = Array.isArray(story.scenes) ? story.scenes : [];
  if (rawScenes.length === 0) {
    throw new Error("The model returned a story with no scenes.");
  }

  const perScene = input.targetSeconds / rawScenes.length;
  const scenes = rawScenes.map((sc, i) => {
    const importance = (sc.importance ?? "MEDIUM").toUpperCase();
    return {
      seq: i,
      start_sec: Math.round(i * perScene),
      end_sec: Math.round((i + 1) * perScene),
      narration: (sc.narration ?? "").trim(),
      subtitle: (sc.subtitle ?? sc.narration ?? "").trim().slice(0, 120),
      importance: (IMPORTANCE.has(importance) ? importance : "MEDIUM") as "HIGH" | "MEDIUM" | "LOW",
      motion_type: importance === "HIGH" ? "animated" : "ken_burns",
      recommended_quality: importance === "HIGH" ? "high" : "standard",
      animate: importance === "HIGH",
      prompt: {
        camera: (sc.camera ?? "Slow push-in").trim(),
        lighting: (sc.lighting ?? "Soft natural light").trim(),
        emotion: (sc.emotion ?? "Curiosity").trim(),
        environment: (sc.environment ?? sc.visual ?? "A fitting setting for the scene").trim(),
      },
    };
  });

  const topic = (story.topic ?? input.topicInput ?? "Untitled story").trim();
  const seoTags = Array.isArray(story.seo?.tags) ? story.seo!.tags!.filter(Boolean).slice(0, 15) : [];

  return {
    topic,
    logline: (story.logline ?? "").trim(),
    moral: (story.moral ?? "").trim(),
    duration_seconds: Math.round(input.targetSeconds),
    beat_sheet: {
      // Provenance is explicit and honest — this is real generated content,
      // and the record says which provider/model produced it.
      source: "ai_generated",
      characters_used: Array.isArray(story.characters) ? story.characters.filter(Boolean) : [],
      seo: {
        title: (story.seo?.title ?? topic).slice(0, 100),
        description: (story.seo?.description ?? input.settings.niche ?? "").slice(0, 500),
        tags: seoTags,
      },
      mock: false,
      model,
      provider,
      generatedAt: new Date().toISOString(),
    },
    scenes,
  };
}
