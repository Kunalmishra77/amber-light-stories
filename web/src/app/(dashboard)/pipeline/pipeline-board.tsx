"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Zap,
  Check,
  X,
  RefreshCw,
  Pencil,
  RotateCcw,
  Rewind,
  Play,
  Pause,
  History,
  Cpu,
  Coins,
  Clock3,
  AlertTriangle,
  Lock,
  Save,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/status-badge";
import { stageLabel } from "@/lib/pipeline/stage-content";
import type { PipelineStageOutput, StageVersionRow } from "@/lib/pipeline/types";
import {
  approveStage,
  editStage,
  pauseRun,
  regenerateStage,
  rejectStage,
  resumeRun,
  retryStage,
  rollbackToStage,
} from "./actions";

export interface BoardStage {
  id: string;
  stage: string;
  seq: number;
  status: string;
  paid: boolean;
  model: string | null;
  tokens_used: number | null;
  cost_usd: number | null;
  duration_ms: number | null;
  attempts: number;
  last_error: string | null;
  approved_at: string | null;
  output: PipelineStageOutput | null;
  fallbackOutput: PipelineStageOutput;
}

interface PipelineBoardProps {
  runId: string;
  runStatus: string;
  currentStage: string | null;
  stages: BoardStage[];
  versionsByStage: Record<string, StageVersionRow[]>;
}

const DOT_COLOR: Record<string, string> = {
  pending: "var(--status-pending)",
  running: "var(--status-running)",
  awaiting_review: "var(--status-awaiting-review)",
  approved: "var(--status-approved)",
  done: "var(--status-approved)",
  failed: "var(--status-failed)",
  rejected: "var(--status-failed)",
  regenerating: "var(--status-running)",
  skipped: "var(--status-pending)",
  paused: "var(--status-paused)",
};

function formatDuration(ms: number | null) {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatCost(v: number | null) {
  if (v === null || v === undefined) return "$0.00";
  return `$${v.toFixed(4)}`;
}

function formatWhen(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type Tab = "output" | "details" | "history";

export function PipelineBoard({
  runId,
  runStatus,
  currentStage,
  stages,
  versionsByStage,
}: PipelineBoardProps) {
  const initialId =
    stages.find((s) => s.stage === currentStage)?.id ?? stages[0]?.id ?? null;

  const [selectedId, setSelectedId] = useState<string | null>(initialId);
  const [tab, setTab] = useState<Tab>("output");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editText, setEditText] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selected = useMemo(
    () => stages.find((s) => s.id === selectedId) ?? null,
    [stages, selectedId]
  );

  const preview = selected?.output ?? selected?.fallbackOutput ?? null;

  function select(stageId: string) {
    setSelectedId(stageId);
    setTab("output");
    setRejectOpen(false);
    setEditOpen(false);
    setFeedback(null);
  }

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const result = await action();
      setFeedback(result.ok ? null : result.error ?? "Something went wrong.");
      if (result.ok) {
        setRejectOpen(false);
        setEditOpen(false);
      }
    });
  }

  const canApprove = selected && !selected.paid && selected.status === "awaiting_review";
  const canReject =
    selected && !selected.paid && selected.status === "awaiting_review";
  const canRegenerate =
    selected &&
    !selected.paid &&
    ["awaiting_review", "done", "approved"].includes(selected.status);
  const canRetry =
    selected && !selected.paid && ["rejected", "failed"].includes(selected.status);
  const canEdit = selected && Boolean(selected.output);
  const canRollback =
    selected &&
    ["done", "approved", "awaiting_review", "rejected", "failed"].includes(
      selected.status
    );

  const versions = selected ? versionsByStage[selected.id] ?? [] : [];

  return (
    <div className="flex flex-col gap-6">
      {/* Run-level controls */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-elevated px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Run controls</span>
          <StatusBadge status={runStatus} />
        </div>
        <div className="flex items-center gap-2">
          {runStatus === "paused" ? (
            <button
              type="button"
              disabled={isPending}
              onClick={() => run(() => resumeRun(runId))}
              className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15 disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5" strokeWidth={2} />
              Resume run
            </button>
          ) : (
            <button
              type="button"
              disabled={isPending || runStatus === "awaiting_payment"}
              onClick={() => run(() => pauseRun(runId))}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-elevated disabled:opacity-50"
            >
              <Pause className="h-3.5 w-3.5" strokeWidth={2} />
              Pause run
            </button>
          )}
        </div>
      </div>

      {/* Pipeline rail */}
      <div className="rounded-xl border border-border bg-elevated p-4 shadow-sm">
        <div className="flex items-center gap-1 overflow-x-auto pb-2">
          {stages.map((s, idx) => {
            const isSelected = s.id === selectedId;
            const isCurrent = s.stage === currentStage;
            const color = DOT_COLOR[s.status] ?? DOT_COLOR.pending;

            return (
              <div key={s.id} className="flex shrink-0 items-center">
                <button
                  type="button"
                  onClick={() => select(s.id)}
                  className={cn(
                    "group flex w-[120px] shrink-0 flex-col items-start gap-2 rounded-lg border px-3 py-2.5 text-left transition-all duration-150",
                    isSelected
                      ? "border-primary/50 bg-primary/10"
                      : "border-border bg-surface hover:bg-elevated hover:border-border",
                    isCurrent && !isSelected && "ring-1 ring-primary/60"
                  )}
                  style={
                    isCurrent
                      ? { boxShadow: "0 0 0 1px var(--primary)" }
                      : undefined
                  }
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
                      {String(s.seq).padStart(2, "0")}
                    </span>
                    <div className="flex items-center gap-1">
                      {s.paid ? (
                        <Zap
                          className="h-3 w-3 text-primary"
                          strokeWidth={2.5}
                          aria-label="Paid stage"
                        />
                      ) : null}
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          s.status === "running" && "animate-pulse"
                        )}
                        style={{ backgroundColor: color }}
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                  <span className="line-clamp-2 text-xs font-medium leading-tight text-foreground">
                    {stageLabel(s.stage)}
                  </span>
                </button>
                {idx < stages.length - 1 ? (
                  <div
                    className="h-px w-3 shrink-0"
                    style={{
                      backgroundColor:
                        s.status === "done" || s.status === "approved"
                          ? "var(--status-approved)"
                          : "var(--border)",
                    }}
                    aria-hidden="true"
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* Review panel */}
      {selected ? (
        <div className="rounded-xl border border-border bg-elevated p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="mb-1 flex items-center gap-2">
                <span className="text-xs font-medium tabular-nums text-muted-foreground">
                  Stage {String(selected.seq).padStart(2, "0")} / 19
                </span>
                {selected.paid ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                    <Zap className="h-2.5 w-2.5" strokeWidth={2.5} />
                    Paid
                  </span>
                ) : null}
              </div>
              <h2 className="text-lg font-semibold text-foreground">
                {stageLabel(selected.stage)}
              </h2>
            </div>
            <StatusBadge status={selected.status} />
          </div>

          {feedback ? (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-[var(--status-failed)]/30 bg-[var(--status-failed)]/10 px-3 py-2.5 text-xs text-[var(--status-failed)]">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              <span>{feedback}</span>
            </div>
          ) : null}

          {/* Tabs */}
          <div className="mt-5 flex items-center gap-1 border-b border-border">
            {(["output", "details", "history"] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  "-mb-px border-b-2 px-3 py-2 text-xs font-medium capitalize transition-colors",
                  tab === t
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {t === "history" ? `History (${versions.length})` : t}
              </button>
            ))}
          </div>

          <div className="mt-4">
            {tab === "output" ? (
              <div className="flex flex-col gap-4">
                {selected.paid ? (
                  <div className="flex items-start gap-3 rounded-lg border border-primary/25 bg-primary/10 px-4 py-3">
                    <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={1.75} />
                    <p className="text-sm text-foreground">
                      ⚡ Paid generation stage — runs only at Phase 5 with
                      explicit permission. No cost has been incurred.
                    </p>
                  </div>
                ) : null}
                {preview?.sections?.length ? (
                  preview.sections.map((section) => (
                    <div key={section.label}>
                      <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        {section.label}
                      </p>
                      <p
                        lang={selected.stage === "script" ? "en" : undefined}
                        className="whitespace-pre-wrap rounded-lg border border-border bg-surface px-4 py-3 text-sm leading-relaxed text-foreground"
                      >
                        {section.value}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Nothing generated yet — this stage hasn&apos;t been
                    reached.
                  </p>
                )}

                {editOpen ? (
                  <div className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={6}
                      className="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus-visible:border-primary"
                      placeholder="Edit this stage's output…"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() =>
                          run(() => editStage(selected.id, editText))
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
                      >
                        <Save className="h-3.5 w-3.5" strokeWidth={2} />
                        Save edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditOpen(false)}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}

                {rejectOpen ? (
                  <div className="flex flex-col gap-2 rounded-lg border border-[var(--status-failed)]/30 bg-[var(--status-failed)]/5 p-3">
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      rows={3}
                      className="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus-visible:border-[var(--status-failed)]"
                      placeholder="Why is this being rejected?"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() =>
                          run(() => rejectStage(selected.id, rejectReason))
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--status-failed)] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
                      >
                        <X className="h-3.5 w-3.5" strokeWidth={2} />
                        Confirm reject
                      </button>
                      <button
                        type="button"
                        onClick={() => setRejectOpen(false)}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {tab === "details" ? (
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-border bg-surface p-3">
                  <dt className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Cpu className="h-3 w-3" strokeWidth={1.75} /> Model
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-foreground">
                    {selected.model ?? "—"}
                  </dd>
                </div>
                <div className="rounded-lg border border-border bg-surface p-3">
                  <dt className="text-[11px] text-muted-foreground">Tokens</dt>
                  <dd className="mt-1 text-sm font-medium tabular-nums text-foreground">
                    {selected.tokens_used ?? "—"}
                  </dd>
                </div>
                <div className="rounded-lg border border-border bg-surface p-3">
                  <dt className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Coins className="h-3 w-3" strokeWidth={1.75} /> Cost
                  </dt>
                  <dd className="mt-1 text-sm font-medium tabular-nums text-foreground">
                    {formatCost(selected.cost_usd)}
                  </dd>
                </div>
                <div className="rounded-lg border border-border bg-surface p-3">
                  <dt className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Clock3 className="h-3 w-3" strokeWidth={1.75} /> Duration
                  </dt>
                  <dd className="mt-1 text-sm font-medium tabular-nums text-foreground">
                    {formatDuration(selected.duration_ms)}
                  </dd>
                </div>
                <div className="rounded-lg border border-border bg-surface p-3">
                  <dt className="text-[11px] text-muted-foreground">Attempts</dt>
                  <dd className="mt-1 text-sm font-medium tabular-nums text-foreground">
                    {selected.attempts}
                  </dd>
                </div>
                <div className="rounded-lg border border-border bg-surface p-3">
                  <dt className="text-[11px] text-muted-foreground">Approved</dt>
                  <dd className="mt-1 text-sm font-medium text-foreground">
                    {formatWhen(selected.approved_at)}
                  </dd>
                </div>
                {selected.last_error ? (
                  <div className="col-span-2 rounded-lg border border-[var(--status-failed)]/30 bg-[var(--status-failed)]/10 p-3 sm:col-span-4">
                    <dt className="text-[11px] text-[var(--status-failed)]">
                      Last error
                    </dt>
                    <dd className="mt-1 text-sm text-foreground">
                      {selected.last_error}
                    </dd>
                  </div>
                ) : null}
              </dl>
            ) : null}

            {tab === "history" ? (
              versions.length === 0 ? (
                <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                  <History className="h-4 w-4" strokeWidth={1.75} />
                  No prior versions — this stage hasn&apos;t been regenerated.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {versions
                    .slice()
                    .sort((a, b) => b.version - a.version)
                    .map((v) => (
                      <details
                        key={v.id}
                        className="rounded-lg border border-border bg-surface px-3 py-2"
                      >
                        <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-medium text-foreground [&::-webkit-details-marker]:hidden">
                          <span>Version {v.version}</span>
                          <span className="text-muted-foreground">
                            {formatWhen(v.created_at)}
                          </span>
                        </summary>
                        <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                          {v.output?.summary ?? "—"}
                        </p>
                      </details>
                    ))}
                </div>
              )
            ) : null}
          </div>

          {/* Actions */}
          <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-border pt-4">
            {selected.paid ? (
              <button
                type="button"
                disabled
                title={PAID_TITLE}
                className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary opacity-70"
              >
                <Zap className="h-3.5 w-3.5" strokeWidth={2} />
                Requires paid run (Phase 5 permission)
              </button>
            ) : (
              <>
                {canApprove ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => run(() => approveStage(selected.id))}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5" strokeWidth={2} />
                    Approve
                  </button>
                ) : null}
                {canReject ? (
                  <button
                    type="button"
                    onClick={() => setRejectOpen((v) => !v)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-elevated"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={2} />
                    Reject
                  </button>
                ) : null}
                {canRegenerate ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => run(() => regenerateStage(selected.id))}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-elevated disabled:opacity-50"
                  >
                    <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
                    Regenerate
                  </button>
                ) : null}
                {canRetry ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => run(() => retryStage(selected.id))}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-elevated disabled:opacity-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
                    Retry
                  </button>
                ) : null}
              </>
            )}
            {canEdit ? (
              <button
                type="button"
                onClick={() => {
                  setEditText(
                    preview?.sections?.map((s) => s.value).join("\n\n") ?? ""
                  );
                  setEditOpen((v) => !v);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-elevated"
              >
                <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                Edit
              </button>
            ) : null}
            {canRollback ? (
              <button
                type="button"
                disabled={isPending}
                onClick={() =>
                  run(() => rollbackToStage(runId, selected.seq))
                }
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                <Rewind className="h-3.5 w-3.5" strokeWidth={2} />
                Roll back run to here
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const PAID_TITLE =
  "This stage calls a paid generation API. It only runs during Phase 5 with explicit permission.";
