"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Download, Loader2 } from "lucide-react";
import { exportTenantDataAction } from "./actions";

/**
 * Triggers the GDPR-style export server action, then turns the returned
 * JSON string into a browser download client-side — no route handler
 * needed. See exportTenantDataAction in ./actions.ts for what's included.
 */
export function DataExportButton() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await exportTenantDataAction();
      if (!result.ok || !result.json) {
        setError(result.error ?? "Couldn't export your data.");
        return;
      }
      const blob = new Blob([result.json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `workspace-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2 text-xs font-medium text-foreground transition-colors hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
        ) : (
          <Download className="h-3.5 w-3.5" strokeWidth={2} />
        )}
        {isPending ? "Preparing export…" : "Export my data"}
      </button>
      {error ? (
        <div className="flex items-start gap-1.5 text-xs text-[var(--status-failed)]">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2} />
          <span>{error}</span>
        </div>
      ) : null}
    </div>
  );
}
