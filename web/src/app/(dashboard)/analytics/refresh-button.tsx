"use client";

import { useState, useTransition } from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { refreshAnalyticsAction } from "./actions";

/** Triggers a dry analytics ingestion for the current workspace. */
export function RefreshAnalyticsButton({ disabled }: { disabled?: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        disabled={isPending || disabled}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await refreshAnalyticsAction();
            if (!result.ok) setError(result.error ?? "Refresh failed.");
          });
        }}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
        )}
      >
        <RefreshCw className={cn("h-3.5 w-3.5", isPending && "animate-spin")} strokeWidth={2} />
        {isPending ? "Refreshing…" : "Refresh analytics"}
      </button>
      {error ? (
        <span className="inline-flex items-center gap-1 text-xs text-[var(--status-failed)]">
          <AlertTriangle className="h-3 w-3" strokeWidth={2} />
          {error}
        </span>
      ) : null}
    </div>
  );
}
