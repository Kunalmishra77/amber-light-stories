import type { LucideIcon } from "lucide-react";
import { Cpu, Wand2, ImageIcon, Clapperboard, Mic, Film } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";

// Reads live rows from Supabase on every request — never prerender this.
export const dynamic = "force-dynamic";

interface WorkerDef {
  name: string;
  provider: string;
  icon: LucideIcon;
  owns: string[];
  jobTypes: string[];
}

const WORKERS: WorkerDef[] = [
  {
    name: "Planning",
    provider: "OpenAI",
    icon: Wand2,
    owns: [
      "Topic",
      "Research",
      "Script",
      "Storyboard",
      "Scene Breakdown",
      "Character Assignment",
      "Scene Prompts",
      "Metadata / SEO",
    ],
    jobTypes: ["topic", "research", "script", "storyboard"],
  },
  {
    name: "Image",
    provider: "fal",
    icon: ImageIcon,
    owns: ["Keyframe Images"],
    jobTypes: ["keyframe_images", "image"],
  },
  {
    name: "Motion",
    provider: "fal",
    icon: Clapperboard,
    owns: ["Motion Clips"],
    jobTypes: ["motion_clips", "motion"],
  },
  {
    name: "Voice",
    provider: "ElevenLabs",
    icon: Mic,
    owns: ["Voice", "Background Music", "Sound Effects"],
    jobTypes: ["voice", "tts"],
  },
  {
    name: "Render",
    provider: "FFmpeg",
    icon: Film,
    owns: ["Subtitles", "Transitions", "Render", "Thumbnail"],
    jobTypes: ["render", "subtitles", "thumbnail"],
  },
];

interface JobRow {
  type: string | null;
  status: string | null;
  updated_at: string | null;
}

export default async function WorkersPage() {
  const supabase = await createClient();

  let jobs: JobRow[] = [];
  try {
    const { data, error } = await supabase
      .from("jobs")
      .select("type, status, updated_at")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    jobs = data ?? [];
  } catch {
    jobs = [];
  }

  return (
    <div>
      <PageHeader
        title="Workers"
        description="The stage runners that execute each pipeline stage."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {WORKERS.map((worker) => {
          const relatedJobs = jobs.filter((j) =>
            worker.jobTypes.includes(j.type ?? "")
          );
          const lastJob = relatedJobs[0];

          return (
            <div
              key={worker.name}
              className="flex flex-col gap-4 rounded-xl border border-border bg-elevated p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <worker.icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">
                      {worker.name}
                      <span className="ml-1.5 font-normal text-muted-foreground">
                        / {worker.provider}
                      </span>
                    </h2>
                  </div>
                </div>
                <StatusBadge
                  status={lastJob ? (lastJob.status ?? "pending") : "pending"}
                  className="shrink-0"
                />
              </div>

              <p className="text-xs text-muted-foreground">
                {lastJob
                  ? `Last activity: ${lastJob.status ?? "unknown"} · ${new Date(
                      lastJob.updated_at ?? Date.now()
                    ).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}`
                  : "idle — runs at generation"}
              </p>

              <div className="flex flex-wrap gap-1.5 border-t border-border pt-3">
                {worker.owns.map((stage) => (
                  <span
                    key={stage}
                    className="inline-flex items-center rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                  >
                    {stage}
                  </span>
                ))}
              </div>
            </div>
          );
        })}

        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-surface/60 p-5 text-center">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-elevated text-muted-foreground">
            <Cpu className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </div>
          <p className="text-xs text-muted-foreground">
            All workers are conceptual stage runners — they spin up on demand
            during generation and idle otherwise.
          </p>
        </div>
      </div>
    </div>
  );
}
