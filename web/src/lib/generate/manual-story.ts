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
 * A short-form video is a handful of scenes, never hundreds. This hard cap
 * stops a pasted long document (a whole production script, an article) from
 * exploding into one scene per paragraph — which once produced a 287-scene
 * render that looped the worker and burned credits.
 */
const MAX_SCENES = 12;

/** Merge an over-long list of chunks down to at most `max`, evenly. */
function capChunks(items: string[], max: number): string[] {
  if (items.length <= max) return items;
  const perGroup = Math.ceil(items.length / max);
  const out: string[] = [];
  for (let i = 0; i < items.length; i += perGroup) {
    out.push(items.slice(i, i + perGroup).join(" "));
  }
  return out;
}

/**
 * Split a hand-written script into scene-sized narration chunks.
 *
 * Blank-line-separated paragraphs are the author's own beats, so those win.
 * A single unbroken block is split on sentence boundaries — including the
 * Devanagari danda (।). Either way the result is capped at MAX_SCENES so a
 * huge paste can never become hundreds of scenes.
 */
function splitIntoBeats(script: string, targetScenes: number): string[] {
  const paragraphs = script
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (paragraphs.length >= 2) return capChunks(paragraphs, MAX_SCENES);

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
  return capChunks(chunks, MAX_SCENES);
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
      // Every scene asks for real AI image-to-video; the budget decides how
      // many actually animate (rest fall back to camera motion).
      motion_type: "ai_animation",
      recommended_quality:
        importance === "HIGH" ? "High" : importance === "MEDIUM" ? "Medium" : "Low",
      animate: true,
      prompt: {
        // `topic` anchors every frame; `subject` is what the image model
        // illustrates. Together they keep each scene on-subject even though the
        // client wrote narration, not shot descriptions.
        topic: title,
        subject: `${line} — ${title}`,
        style: input.settings?.niche ?? "clear, realistic, documentary style",
        camera: CAMERA[i % CAMERA.length],
        lighting: LIGHTING[i % LIGHTING.length],
        emotion: EMOTION[i % EMOTION.length],
        environment: title,
        // Marks the scene for i2v; the camera move gives the clip something to
        // animate even though the client wrote words, not shot directions.
        animation_required: true,
        motion: `${CAMERA[i % CAMERA.length]}, natural lifelike movement, living environment`,
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
