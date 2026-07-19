"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { regenerateStrategy } from "./actions";

export function RegenerateButton({ canEdit }: { canEdit: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (!canEdit) return null;

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await regenerateStrategy();
            if (!result.ok) {
              setError(result.error ?? "Couldn't regenerate the strategy.");
              return;
            }
            router.refresh();
          })
        }
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} strokeWidth={1.75} />
        {isPending ? "Regenerating…" : "Regenerate strategy ($0)"}
      </button>
      {error ? (
        <div className="flex items-center gap-1.5 text-xs text-[var(--status-failed)]">
          <AlertTriangle className="h-3 w-3 shrink-0" strokeWidth={2} />
          <span>{error}</span>
        </div>
      ) : null}
    </div>
  );
}
