import { Activity, CheckCircle2, Coins, Gauge, RotateCw, Timer, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import {
  getStagePreview,
  isPaidStage,
  type SceneForContent,
  type StoryForContent,
} from "@/lib/pipeline/stage-content";
import type {
  PipelineRunRow,
  PipelineStageRow,
  StageVersionRow,
} from "@/lib/pipeline/types";
import { PipelineBoard, type BoardStage } from "./pipeline-board";

// Reads live rows from Supabase on every request — never prerender this.
export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const supabase = await createClient();
  const tenantId = (await getCurrentTenantId()) ?? "";

  const { data: run } = await supabase
    .from("pipeline_runs")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle<PipelineRunRow>();

  if (!run) {
    return (
      <div>
        <PageHeader
          title="Live Pipeline"
          description="Watch pipeline runs move through each stage in real time."
        />
        <EmptyState
          icon={Activity}
          title="No pipeline run yet"
          description="Once a story enters the pipeline, its live progress will show up here."
          action={{ label: "Generate a video", href: "/generate" }}
        />
      </div>
    );
  }

  const [{ data: stages }, { data: story }] = await Promise.all([
    supabase
      .from("pipeline_stages")
      .select("*")
      .eq("run_id", run.id)
      .eq("tenant_id", tenantId)
      .order("seq", { ascending: true }),
    run.story_id
      ? supabase
          .from("stories")
          .select("id, topic, logline, moral, duration_seconds, beat_sheet")
          .eq("id", run.story_id)
          .eq("tenant_id", tenantId)
          .maybeSingle<StoryForContent>()
      : Promise.resolve({ data: null }),
  ]);

  const stageRows = (stages as PipelineStageRow[] | null) ?? [];

  const { data: scenes } = run.story_id
    ? await supabase
        .from("scenes")
        .select(
          "id, seq, start_sec, end_sec, narration, subtitle, importance, motion_type, recommended_quality, animate, prompt"
        )
        .eq("story_id", run.story_id)
        .eq("tenant_id", tenantId)
        .order("seq", { ascending: true })
    : { data: [] as SceneForContent[] };

  const sceneRows = (scenes as SceneForContent[] | null) ?? [];

  const storyRow: StoryForContent = story ?? {
    id: run.story_id ?? "",
    topic: null,
    logline: null,
    moral: null,
    duration_seconds: null,
    beat_sheet: null,
  };

  const stageIds = stageRows.map((s) => s.id);
  const { data: versions } =
    stageIds.length > 0
      ? await supabase
          .from("stage_versions")
          .select("*")
          .in("stage_id", stageIds)
          .eq("tenant_id", tenantId)
          .order("version", { ascending: false })
      : { data: [] as StageVersionRow[] };

  const versionsByStage: Record<string, StageVersionRow[]> = {};
  for (const v of (versions as StageVersionRow[] | null) ?? []) {
    (versionsByStage[v.stage_id] ??= []).push(v);
  }

  const boardStages: BoardStage[] = stageRows.map((s) => ({
    id: s.id,
    stage: s.stage,
    seq: s.seq,
    status: s.status,
    paid: isPaidStage(s.stage),
    model: s.model,
    tokens_used: s.tokens_used,
    cost_usd: s.cost_usd,
    duration_ms: s.duration_ms,
    attempts: s.attempts ?? 0,
    last_error: s.last_error,
    approved_at: s.approved_at,
    output: s.output,
    fallbackOutput: getStagePreview(s.stage, storyRow, sceneRows),
  }));

  const approvedCount = stageRows.filter((s) =>
    ["done", "approved"].includes(s.status)
  ).length;

  const costSoFar = stageRows.reduce((sum, s) => sum + (s.cost_usd ?? 0), 0);
  const budget = run.budget_usd ?? 1.55;

  // ---- Pipeline visibility: progress %, queue position, retries, rough ETA ----
  const progressPct =
    stageRows.length > 0 ? Math.round((approvedCount / stageRows.length) * 100) : 0;

  const currentIndex = stageRows.findIndex((s) => s.stage === run.current_stage);
  const queuePosition =
    currentIndex >= 0 ? currentIndex + 1 : run.status === "done" ? stageRows.length : 0;

  const totalRetries = stageRows.reduce((sum, s) => sum + (s.attempts ?? 0), 0);

  const doneDurations = stageRows
    .map((s) => s.duration_ms)
    .filter((d): d is number => typeof d === "number" && d > 0);
  const avgDurationMs =
    doneDurations.length > 0
      ? doneDurations.reduce((a, b) => a + b, 0) / doneDurations.length
      : null;
  const remainingStages = Math.max(stageRows.length - approvedCount, 0);
  const etaMs = avgDurationMs !== null ? remainingStages * avgDurationMs : null;
  const etaLabel =
    run.status === "done"
      ? "Complete"
      : etaMs === null
        ? "Not enough data yet"
        : etaMs < 60_000
          ? `~${Math.round(etaMs / 1000)}s remaining`
          : `~${Math.round(etaMs / 60_000)}m remaining`;

  return (
    <div>
      <PageHeader
        title="Live Pipeline"
        description="Watch pipeline runs move through each stage in real time — approve, reject, regenerate or roll back any planning stage at $0."
      />

      {/* Header rail */}
      <div className="mb-6 flex flex-col gap-4 rounded-xl border border-border bg-elevated p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <h2 lang="hi" className="text-lg font-semibold text-foreground">
              {storyRow.topic || "Untitled story"}
            </h2>
            <StatusBadge status={run.status ?? "running"} />
          </div>
          <p className="text-xs text-muted-foreground">
            Run started{" "}
            {run.started_at
              ? new Date(run.started_at).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })
              : "—"}
          </p>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted-foreground">
          <Coins className="h-3.5 w-3.5 text-primary" strokeWidth={1.75} />
          Cost so far:
          <span className="tabular-nums text-foreground">
            ${costSoFar.toFixed(4)}
          </span>
        </div>
      </div>

      {/* Overall progress bar */}
      <div className="mb-8 rounded-xl border border-border bg-elevated p-5 shadow-sm">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Gauge className="h-3.5 w-3.5 text-primary" strokeWidth={1.75} />
            Overall progress
          </span>
          <span className="tabular-nums text-foreground">{progressPct}%</span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{etaLabel}</p>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Stages approved"
          value={`${approvedCount} / ${stageRows.length}`}
          icon={CheckCircle2}
        />
        <StatCard
          label="Cost so far"
          value={`$${costSoFar.toFixed(4)}`}
          icon={Coins}
        />
        <StatCard label="Budget" value={`$${budget.toFixed(2)}`} icon={Wallet} />
        <StatCard
          label="Queue position"
          value={queuePosition > 0 ? `${queuePosition} / ${stageRows.length}` : "—"}
          icon={Gauge}
        />
        <StatCard label="Total retries" value={totalRetries} icon={RotateCw} />
        <StatCard label="ETA" value={etaLabel} icon={Timer} />
      </div>

      <PipelineBoard
        runId={run.id}
        runStatus={run.status ?? "running"}
        currentStage={run.current_stage}
        stages={boardStages}
        versionsByStage={versionsByStage}
      />
    </div>
  );
}
