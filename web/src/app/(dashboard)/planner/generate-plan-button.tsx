"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Sparkles } from "lucide-react";
import { generateContentPlan } from "./actions";

export function GeneratePlanButton() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await generateContentPlan();
      if (!result.ok) {
        setError(result.error ?? "Couldn't generate the plan.");
      }
    });
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        disabled={isPending}
        onClick={handleClick}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Sparkles className="h-4 w-4" strokeWidth={2} />
        {isPending ? "Generating…" : "Generate 30-Day Content Strategy"}
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
