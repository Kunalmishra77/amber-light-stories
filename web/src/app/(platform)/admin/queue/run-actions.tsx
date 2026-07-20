"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Ban, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { cancelRunAction, retryRunAction, type ActionResult } from "./actions";

const BUTTON_CLASS =
  "inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-50";

/** Non-terminal runs can be cancelled; failed/cancelled runs can be retried. */
const RETRYABLE = new Set(["failed", "cancelled"]);
const TERMINAL = new Set(["done", "cancelled"]);

interface RunActionsProps {
  runId: string;
  status: string;
}

export function RunActions({ runId, status }: RunActionsProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  function run(action: string, fn: () => Promise<ActionResult>) {
    setError(null);
    setPendingAction(action);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error ?? "Action failed.");
      setPendingAction(null);
    });
  }

  const canRetry = RETRYABLE.has(status);
  const canCancel = !TERMINAL.has(status);

  if (!canRetry && !canCancel) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {canRetry ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => run("retry", () => retryRunAction(runId))}
            className={BUTTON_CLASS}
          >
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
            {isPending && pendingAction === "retry" ? "Retrying…" : "Retry"}
          </button>
        ) : null}

        {canCancel ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              if (
                typeof window !== "undefined" &&
                !window.confirm("Cancel this run? Any in-flight stages are marked skipped. This is terminal.")
              ) {
                return;
              }
              run("cancel", () => cancelRunAction(runId));
            }}
            className={cn(BUTTON_CLASS, "text-[var(--status-failed)] hover:border-[var(--status-failed)]/40")}
          >
            <Ban className="h-3.5 w-3.5" strokeWidth={2} />
            {isPending && pendingAction === "cancel" ? "Cancelling…" : "Cancel"}
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
