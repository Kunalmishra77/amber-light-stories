"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { History, MessageSquare, RotateCcw, ShieldAlert, ShieldCheck } from "lucide-react";
import type { StageVersion } from "@/lib/pipeline/versioning";
import type { CommentView } from "@/lib/collab/comments";
import { approveStage, rejectStage } from "../../pipeline/actions";
import { postComment, restoreVersion } from "../actions";
import { cn } from "@/lib/utils";

interface DecisionPreview {
  decision: string;
  allowed: boolean;
  reasons: string[];
  evidence: Record<string, unknown>;
  mode: string;
}

const KIND_LABELS: Record<string, string> = {
  ai_generated: "Generated",
  human_edited: "Edited by a human",
  regenerated: "Regenerated",
  restored: "Restored",
};

/** Flattens a stage output into comparable lines. */
function toLines(output: Record<string, unknown> | null): string[] {
  if (!output) return [];
  const sections = (output.sections as { label: string; value: string }[] | undefined) ?? [];
  const body = sections.map((s) => `${s.label}: ${s.value}`).join("\n");
  const text = body || JSON.stringify(output, null, 2);
  return text.split("\n");
}

/**
 * Longest-common-subsequence diff. Small inputs (a stage output), so the O(n·m)
 * table is fine and the result is exact rather than heuristic.
 */
function diffLines(a: string[], b: string[]): { text: string; kind: "same" | "add" | "del" }[] {
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out: { text: string; kind: "same" | "add" | "del" }[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ text: a[i], kind: "same" });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ text: a[i], kind: "del" });
      i++;
    } else {
      out.push({ text: b[j], kind: "add" });
      j++;
    }
  }
  while (i < n) out.push({ text: a[i++], kind: "del" });
  while (j < m) out.push({ text: b[j++], kind: "add" });
  return out;
}

export function ReviewDetail({
  stageId,
  stage,
  status,
  versions,
  comments,
  decision,
}: {
  stageId: string;
  stage: string;
  status: string;
  versions: StageVersion[];
  comments: CommentView[];
  decision: DecisionPreview | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [body, setBody] = useState("");
  // Versions arrive newest-first.
  const [compareId, setCompareId] = useState<string | null>(versions[1]?.id ?? null);

  const current = versions[0] ?? null;
  const compare = versions.find((v) => v.id === compareId) ?? null;

  const diff = useMemo(
    () => (current && compare ? diffLines(toLines(compare.output), toLines(current.output)) : []),
    [current, compare]
  );

  function act(fn: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const r = await fn();
      setMessage(r.ok ? "Done." : r.error ?? "That didn't work.");
      router.refresh();
    });
  }

  const blocked = decision && !decision.allowed;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-6">
        {decision && (
          <div
            className={cn(
              "rounded-xl border p-4",
              blocked ? "border-status-failed/40 bg-status-failed/5" : "border-border bg-elevated"
            )}
          >
            <div className="mb-2 flex items-center gap-2">
              {blocked ? (
                <ShieldAlert className="h-4 w-4 text-status-failed" strokeWidth={1.75} />
              ) : (
                <ShieldCheck className="h-4 w-4 text-status-approved" strokeWidth={1.75} />
              )}
              <h2 className="text-sm font-semibold text-foreground">
                Safety checks: {decision.decision.replace(/_/g, " ")}
              </h2>
              <span className="text-[11px] text-muted-foreground">{decision.mode} mode</span>
            </div>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-xs text-muted-foreground">
              {decision.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-xl border border-border bg-elevated p-4">
          <div className="mb-3 flex items-center gap-2">
            <History className="h-4 w-4 text-primary" strokeWidth={1.75} />
            <h2 className="text-sm font-semibold text-foreground">Version history</h2>
            <span className="text-[11px] text-muted-foreground">
              {versions.length} version{versions.length === 1 ? "" : "s"} · history is immutable
            </span>
          </div>

          {versions.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              This stage predates version tracking. Its current output is captured as version 1 the
              first time it is edited, approved or rolled back.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {versions.map((v, idx) => (
                <li
                  key={v.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2"
                >
                  <span className="text-xs font-medium text-foreground">v{v.version}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {KIND_LABELS[v.kind] ?? v.kind}
                    {idx === 0 ? " · active" : ""}
                  </span>
                  {v.note && <span className="text-[11px] text-muted-foreground">· {v.note}</span>}
                  <div className="ml-auto flex items-center gap-2">
                    {idx !== 0 && (
                      <>
                        <button
                          type="button"
                          onClick={() => setCompareId(v.id)}
                          className={cn(
                            "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                            compareId === v.id
                              ? "border-primary/40 bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:text-foreground"
                          )}
                        >
                          Compare
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => act(() => restoreVersion(stageId, v.id))}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                        >
                          <RotateCcw className="h-3 w-3" strokeWidth={2} />
                          Restore
                        </button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {compare && current && (
          <div className="rounded-xl border border-border bg-elevated p-4">
            <h2 className="mb-3 text-sm font-semibold text-foreground">
              v{compare.version} → v{current.version}
            </h2>
            <pre className="max-h-96 overflow-auto rounded-lg bg-surface p-3 text-xs leading-relaxed">
              {diff.map((line, i) => (
                <div
                  key={`${i}-${line.text.slice(0, 24)}`}
                  className={cn(
                    "whitespace-pre-wrap",
                    line.kind === "add" && "bg-status-approved/10 text-status-approved",
                    line.kind === "del" && "bg-status-failed/10 text-status-failed line-through",
                    line.kind === "same" && "text-muted-foreground"
                  )}
                >
                  {line.kind === "add" ? "+ " : line.kind === "del" ? "- " : "  "}
                  {line.text}
                </div>
              ))}
            </pre>
          </div>
        )}

        <div className="rounded-xl border border-border bg-elevated p-4">
          <div className="mb-3 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" strokeWidth={1.75} />
            <h2 className="text-sm font-semibold text-foreground">Discussion</h2>
          </div>

          <ul className="mb-3 flex flex-col gap-2">
            {comments.length === 0 && (
              <li className="text-xs text-muted-foreground">
                No comments yet. Mention a teammate with @name to pull them in.
              </li>
            )}
            {comments.map((c) => (
              <li key={c.id} className="rounded-lg border border-border bg-surface px-3 py-2">
                <p className="text-[11px] font-medium text-foreground">{c.authorName}</p>
                <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">{c.body}</p>
              </li>
            ))}
          </ul>

          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="Add a note, or @mention a teammate…"
            className="w-full rounded-lg border border-border bg-surface p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            type="button"
            disabled={pending || !body.trim()}
            onClick={() =>
              act(async () => {
                const r = await postComment(stageId, body);
                if (r.ok) setBody("");
                return r;
              })
            }
            className="mt-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            Post
          </button>
        </div>
      </div>

      <aside className="flex h-fit flex-col gap-3 rounded-xl border border-border bg-elevated p-4">
        <h2 className="text-sm font-semibold text-foreground">Decision</h2>
        <p className="text-xs text-muted-foreground">
          Stage <span className="text-foreground">{stage.replace(/_/g, " ")}</span> · {status.replace(/_/g, " ")}
        </p>

        <button
          type="button"
          disabled={pending || Boolean(blocked)}
          onClick={() => act(() => approveStage(stageId))}
          className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          Approve
        </button>
        {blocked && (
          <p className="text-[11px] text-status-failed">
            Approval is unavailable while the checks above are failing. Fix the content — a block
            cannot be approved away.
          </p>
        )}

        <button
          type="button"
          disabled={pending}
          onClick={() => {
            const reason = window.prompt("Why are you rejecting this?")?.trim();
            if (reason === undefined) return;
            act(() => rejectStage(stageId, reason || "Rejected by reviewer."));
          }}
          className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-surface disabled:opacity-50"
        >
          Reject
        </button>

        {message && <p className="text-[11px] text-muted-foreground">{message}</p>}
      </aside>
    </div>
  );
}
