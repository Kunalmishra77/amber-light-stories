import type {
  MockSceneDraft,
  MockStoryDraft,
  MockStorySettings,
} from "@/lib/generate/mock-story";

export interface BuildManualDraftInput {
  title: string;
  script: string;
  settings?: MockStorySettings | null;
}

// How the visual for a scene is framed. The client wrote narration, not shot
// descriptions, so the image prompt is built from the line itself plus a
// rotating visual treatment — enough for the model to compose a distinct
// frame per scene rather than repeating one picture.
const CAMERA = ["Wide establishing shot", "Slow push-in", "Over-the-shoulder", "Low angle", "Close-up", "Tracking shot"];
const LIGHTING = ["Natural daylight", "Golden hour warmth", "Soft overcast", "Dusk blue tones", "Bright midday", "Warm interior"];
const EMOTION = ["Informative", "Serious", "Hopeful", "Reflective", "Resolute", "Calm"];

/**
 * Split a hand-written script into scene-sized narration chunks.
 *
 * Blank-line-separated paragraphs are the author's own beats, so those win.
 * A single unbroken block is split on sentence boundaries — including the
 * Devanagari danda (।) — into a sensible number of scenes for the duration.
 */
function splitIntoBeats(script: string, targetScenes: number): string[] {
  const paragraphs = script
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (paragraphs.length >= 2) return paragraphs;

  const sentences = (paragraphs[0] ?? script)
    .split(/(?<=[।.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length <= 1) return sentences.length ? sentences : [script.trim()];

  // Group sentences into ~targetScenes even chunks so no scene is one word.
  const perChunk = Math.max(1, Math.round(sentences.length / targetScenes));
  const chunks: string[] = [];
  for (let i = 0; i < sentences.length; i += perChunk) {
    chunks.push(sentences.slice(i, i + perChunk).join(" "));
  }
  return chunks;
}

/**
 * Turn a client-written title + script into the SAME draft shape the AI
 * generator produces, so a manual story flows through the identical pipeline
 * (scenes → keyframes → motion → voice → render). The difference is only the
 * source: the narration and subtitles are the client's exact words, and the
 * image prompts are built from each line rather than invented by an LLM.
 */
export function buildManualDraft(input: BuildManualDraftInput): MockStoryDraft {
  const title = input.title.trim();
  const script = input.script.trim();
  const targetSeconds = input.settings?.targetSeconds ?? 45;

  // Aim for one scene per ~8s, clamped to a sane 3–8, then let the author's
  // own paragraph breaks override that if they wrote more/fewer.
  const targetScenes = Math.max(3, Math.min(8, Math.round(targetSeconds / 8)));
  const beats = splitIntoBeats(script, targetScenes);
  const count = Math.max(1, beats.length);
  const sceneLength = targetSeconds / count;

  const scenes: MockSceneDraft[] = beats.map((line, i) => {
    const importance: MockSceneDraft["importance"] =
      i === 0 || i === count - 1 ? "HIGH" : i % 3 === 0 ? "MEDIUM" : "LOW";
    return {
      seq: i + 1,
      start_sec: Number((i * sceneLength).toFixed(1)),
      end_sec: Number(((i + 1) * sceneLength).toFixed(1)),
      // The client's exact words drive the voice AND the on-screen captions.
      narration: line,
      subtitle: line,
      importance,
      motion_type:
        importance === "HIGH" ? "ai_animation" : importance === "MEDIUM" ? "ken_burns" : "static",
      recommended_quality:
        importance === "HIGH" ? "High" : importance === "MEDIUM" ? "Medium" : "Low",
      animate: importance === "HIGH",
      prompt: {
        // `subject` is what the image model actually illustrates (fal reads it);
        // the line plus the video's title keeps every frame on-topic.
        subject: `${line} — ${title}`,
        style: input.settings?.niche ?? "clear, realistic, documentary style",
        camera: CAMERA[i % CAMERA.length],
        lighting: LIGHTING[i % LIGHTING.length],
        emotion: EMOTION[i % EMOTION.length],
        environment: title,
      },
    };
  });

  return {
    topic: title,
    logline: title,
    moral: "",
    duration_seconds: targetSeconds,
    beat_sheet: {
      // Honest provenance: the script is the client's, not AI-written.
      source: "manual",
      characters_used: ["Narrator"],
      seo: {
        title,
        description: beats[0] ?? title,
        tags: [title],
      },
      mock: false,
      generatedAt: new Date().toISOString(),
    },
    scenes,
  };
}
