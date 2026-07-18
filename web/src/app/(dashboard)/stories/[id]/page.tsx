import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  Clock3,
  Film,
  Layers,
  Sparkles,
  Wand2,
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";

// Reads live rows from Supabase on every request — never prerender this.
export const dynamic = "force-dynamic";

interface StoryRow {
  id: string;
  project_id: string | null;
  topic: string | null;
  logline: string | null;
  moral: string | null;
  duration_seconds: number | null;
  status: string | null;
  part_number: number | null;
  series_id: string | null;
  created_at: string | null;
}

type Importance = "HIGH" | "MEDIUM" | "LOW";
type MotionType =
  | "static"
  | "ken_burns"
  | "zoom"
  | "pan"
  | "motion_crop"
  | "ai_animation";
type Quality = "Low" | "Medium" | "High";

interface ScenePrompt {
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
}

interface SceneRow {
  id: string;
  story_id: string;
  seq: number | null;
  start_sec: number | null;
  end_sec: number | null;
  narration: string | null;
  subtitle: string | null;
  importance: Importance | string | null;
  importance_score: number | null;
  motion_type: MotionType | string | null;
  recommended_quality: Quality | string | null;
  animate: boolean | null;
  prompt: ScenePrompt | null;
}

const IMPORTANCE_STYLES: Record<string, string> = {
  HIGH: "text-primary bg-primary/10 border-primary/30",
  MEDIUM:
    "text-[var(--status-awaiting-review)] bg-[color-mix(in_srgb,var(--status-awaiting-review)_14%,transparent)] border-[color-mix(in_srgb,var(--status-awaiting-review)_30%,transparent)]",
  LOW: "text-muted-foreground bg-zinc-500/10 border-zinc-500/25",
};

function formatDuration(seconds: number | null) {
  if (seconds === null || Number.isNaN(seconds)) return "—";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}

function formatTimeRange(start: number | null, end: number | null) {
  const s = start ?? 0;
  const e = end ?? 0;
  return `${s.toFixed(1)}s – ${e.toFixed(1)}s`;
}

function motionLabel(motion: string | null) {
  if (!motion) return "Unknown motion";
  return motion
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default async function StoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createAdminClient();

  const { data: story, error: storyError } = await supabase
    .from("stories")
    .select(
      "id, project_id, topic, logline, moral, duration_seconds, status, part_number, series_id, created_at"
    )
    .eq("id", id)
    .maybeSingle<StoryRow>();

  if (storyError || !story) {
    notFound();
  }

  let scenes: SceneRow[] = [];
  let scenesErrored = false;
  try {
    const { data, error } = await supabase
      .from("scenes")
      .select(
        "id, story_id, seq, start_sec, end_sec, narration, subtitle, importance, importance_score, motion_type, recommended_quality, animate, prompt"
      )
      .eq("story_id", id)
      .order("seq", { ascending: true });
    if (error) throw error;
    scenes = data ?? [];
  } catch {
    scenesErrored = true;
  }

  const importanceCounts = { HIGH: 0, MEDIUM: 0, LOW: 0 } as Record<
    Importance,
    number
  >;
  let aiAnimationCount = 0;
  let localMotionCount = 0;
  for (const scene of scenes) {
    const importance = (scene.importance ?? "").toUpperCase();
    if (importance === "HIGH" || importance === "MEDIUM" || importance === "LOW") {
      importanceCounts[importance as Importance] += 1;
    }
    if (scene.animate) {
      aiAnimationCount += 1;
    } else {
      localMotionCount += 1;
    }
  }

  return (
    <div>
      <Link
        href="/stories"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
        Back to Story Queue
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-elevated p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1
            lang="hi"
            className="text-2xl font-semibold leading-snug tracking-tight text-foreground"
          >
            {story.topic || "Untitled story"}
          </h1>
          <StatusBadge status={story.status ?? "pending"} className="shrink-0" />
        </div>

        {story.logline ? (
          <p lang="hi" className="max-w-3xl text-sm text-muted-foreground">
            {story.logline}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Clock3 className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span className="tabular-nums">
              {formatDuration(story.duration_seconds)}
            </span>
          </span>
          {story.part_number ? (
            <span className="inline-flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5" strokeWidth={1.75} />
              Part {story.part_number}
            </span>
          ) : null}
        </div>

        {story.moral ? (
          <div className="mt-1 rounded-lg border border-primary/25 bg-primary/10 px-4 py-3">
            <p className="mb-1 text-xs font-medium uppercase tracking-wider text-primary">
              Moral
            </p>
            <p lang="hi" className="text-sm text-foreground">
              {story.moral}
            </p>
          </div>
        ) : null}
      </div>

      {/* Cost / decision summary */}
      {!scenesErrored && scenes.length > 0 ? (
        <div className="mt-6 rounded-xl border border-border bg-elevated p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-primary" strokeWidth={1.75} />
            <h2 className="text-sm font-semibold text-foreground">
              Generation cost summary
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div className="rounded-lg border border-border bg-surface p-3">
              <p className="text-xs text-muted-foreground">Total scenes</p>
              <p className="text-xl font-semibold tabular-nums text-foreground">
                {scenes.length}
              </p>
            </div>
            <div className="rounded-lg border border-primary/30 bg-primary/10 p-3">
              <p className="text-xs text-primary">High</p>
              <p className="text-xl font-semibold tabular-nums text-primary">
                {importanceCounts.HIGH}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-3">
              <p className="text-xs text-[var(--status-awaiting-review)]">
                Medium
              </p>
              <p className="text-xl font-semibold tabular-nums text-[var(--status-awaiting-review)]">
                {importanceCounts.MEDIUM}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-3">
              <p className="text-xs text-muted-foreground">Low</p>
              <p className="text-xl font-semibold tabular-nums text-foreground">
                {importanceCounts.LOW}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-3">
              <p className="text-xs text-muted-foreground">AI vs local</p>
              <p className="text-xl font-semibold tabular-nums text-foreground">
                {aiAnimationCount}
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  / {localMotionCount}
                </span>
              </p>
            </div>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            AI generation only on HIGH scenes — rest use free local motion.
          </p>
        </div>
      ) : null}

      {/* Scene storyboard */}
      <div className="mt-8">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Film className="h-4 w-4" strokeWidth={1.75} />
          Scene storyboard
        </h2>

        {scenesErrored ? (
          <EmptyState
            icon={Film}
            title="Couldn't load scenes"
            description="There was a problem reaching the scenes table. Check your Supabase connection."
          />
        ) : scenes.length === 0 ? (
          <EmptyState
            icon={Film}
            title="No scenes yet"
            description="Scenes generated for this story will show up here."
          />
        ) : (
          <div className="flex flex-col gap-4">
            {scenes.map((scene, index) => {
              const importance = (scene.importance ?? "LOW").toUpperCase();
              const importanceClass =
                IMPORTANCE_STYLES[importance] ?? IMPORTANCE_STYLES.LOW;
              const prompt = scene.prompt ?? {};
              const hasPromptDetails =
                prompt.camera ||
                prompt.lighting ||
                prompt.color_grade ||
                prompt.emotion ||
                prompt.lens ||
                prompt.motion_direction;

              return (
                <div
                  key={scene.id}
                  className="flex flex-col gap-4 rounded-xl border border-border bg-elevated p-5 shadow-sm transition-shadow duration-200 ease-out hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/30 sm:flex-row"
                >
                  {/* Keyframe placeholder */}
                  <div className="relative aspect-[9/16] max-h-64 w-full shrink-0 overflow-hidden rounded-lg border border-border bg-gradient-to-br from-primary/15 via-surface to-background sm:w-36">
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                      <Camera className="h-6 w-6" strokeWidth={1.5} />
                      <span className="px-2 text-center text-[11px] leading-tight">
                        Keyframe pending
                      </span>
                    </div>
                    <span className="absolute left-2 top-2 rounded-full bg-background/70 px-2 py-0.5 text-[11px] font-medium tabular-nums text-foreground backdrop-blur">
                      #{scene.seq ?? index}
                    </span>
                  </div>

                  {/* Scene details */}
                  <div className="flex min-w-0 flex-1 flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-foreground">
                          Scene {scene.seq ?? index}
                        </h3>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {formatTimeRange(scene.start_sec, scene.end_sec)}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                          importanceClass
                        )}
                      >
                        {importance}
                      </span>

                      {scene.animate ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                          <Sparkles className="h-3 w-3" strokeWidth={2} />
                          AI ANIMATION
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-muted-foreground">
                          Local motion
                        </span>
                      )}

                      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-muted-foreground">
                        {motionLabel(scene.motion_type)}
                      </span>

                      {scene.recommended_quality ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-muted-foreground">
                          {scene.recommended_quality} quality
                        </span>
                      ) : null}
                    </div>

                    {scene.narration ? (
                      <p lang="hi" className="text-sm leading-relaxed text-foreground">
                        {scene.narration}
                      </p>
                    ) : null}

                    {scene.subtitle ? (
                      <p lang="hi" className="text-xs italic text-muted-foreground">
                        {scene.subtitle}
                      </p>
                    ) : null}

                    {hasPromptDetails ? (
                      <details className="group mt-1 rounded-lg border border-border/70 bg-surface/60 px-3 py-2">
                        <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground [&::-webkit-details-marker]:hidden">
                          Prompt details
                        </summary>
                        <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
                          {prompt.camera ? (
                            <div className="flex gap-1.5">
                              <dt className="shrink-0 text-muted-foreground">
                                Camera:
                              </dt>
                              <dd className="text-foreground">{prompt.camera}</dd>
                            </div>
                          ) : null}
                          {prompt.lens ? (
                            <div className="flex gap-1.5">
                              <dt className="shrink-0 text-muted-foreground">
                                Lens:
                              </dt>
                              <dd className="text-foreground">{prompt.lens}</dd>
                            </div>
                          ) : null}
                          {prompt.lighting ? (
                            <div className="flex gap-1.5">
                              <dt className="shrink-0 text-muted-foreground">
                                Lighting:
                              </dt>
                              <dd className="text-foreground">{prompt.lighting}</dd>
                            </div>
                          ) : null}
                          {prompt.color_grade ? (
                            <div className="flex gap-1.5">
                              <dt className="shrink-0 text-muted-foreground">
                                Color grade:
                              </dt>
                              <dd className="text-foreground">
                                {prompt.color_grade}
                              </dd>
                            </div>
                          ) : null}
                          {prompt.emotion ? (
                            <div className="flex gap-1.5">
                              <dt className="shrink-0 text-muted-foreground">
                                Emotion:
                              </dt>
                              <dd className="text-foreground">{prompt.emotion}</dd>
                            </div>
                          ) : null}
                          {prompt.motion_direction ? (
                            <div className="flex gap-1.5">
                              <dt className="shrink-0 text-muted-foreground">
                                Motion:
                              </dt>
                              <dd className="text-foreground">
                                {prompt.motion_direction}
                              </dd>
                            </div>
                          ) : null}
                        </dl>
                      </details>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
