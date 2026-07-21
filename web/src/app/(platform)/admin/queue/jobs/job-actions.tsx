"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Ban, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { redriveJobAction, cancelJobAction, type ActionResult } from "../actions";

const BTN =
  "inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-50";

/** Re-drive is for terminal-but-unsuccessful jobs; cancel for in-flight ones. */
const REDRIVABLE = new Set(["dead", "failed"]);
const CANCELLABLE = new Set(["queued", "running"]);

export function JobActions({ jobId, status }: { jobId: string; status: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  function run(action: string, fn: () => Promise<ActionResult>) {
    setError(null);
    setPending(action);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error ?? "Action failed.");
      setPending(null);
    });
  }

  const canRedrive = REDRIVABLE.has(status);
  const canCancel = CANCELLABLE.has(status);
  if (!canRedrive && !canCancel) return <span className="text-xs text-muted-foreground">—</span>;

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap justify-end gap-2">
        {canRedrive ? (
          <button
            type="button"
            disabled={isPending}
            className={BTN}
            onClick={() => run("redrive", () => redriveJobAction(jobId))}
          >
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
            {isPending && pending === "redrive" ? "Re-driving…" : "Re-drive"}
          </button>
        ) : null}
        {canCancel ? (
          <button
            type="button"
            disabled={isPending}
            className={cn(BTN, "text-[var(--status-failed)] hover:border-[var(--status-failed)]/40")}
            onClick={() => {
              if (typeof window !== "undefined" && !window.confirm("Cancel this job? This is terminal.")) return;
              run("cancel", () => cancelJobAction(jobId));
            }}
          >
            <Ban className="h-3.5 w-3.5" strokeWidth={2} />
            {isPending && pending === "cancel" ? "Cancelling…" : "Cancel"}
          </button>
        ) : null}
      </div>
      {error ? (
        <div className="flex items-start gap-1.5 text-xs text-[var(--status-failed)]">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2} />
          <span>{error}</span>
        </div>
      ) : null}
    </div>
  );
}
