"use client";

import { useState, useTransition } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toggleFlagAction } from "./actions";

export function FlagToggle({ flagId, enabled }: { flagId: string; enabled: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    setError(null);
    startTransition(async () => {
      const result = await toggleFlagAction(flagId, !enabled);
      if (!result.ok) setError(result.error ?? "Couldn't update flag.");
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={isPending}
        onClick={toggle}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          enabled ? "bg-primary" : "bg-elevated border border-border"
        )}
      >
        <span
          className={cn(
            "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
            enabled ? "translate-x-4" : "translate-x-0.5"
          )}
        />
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
