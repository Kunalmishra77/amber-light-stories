"use client";

import { useState, useTransition, type FormEvent } from "react";
import { AlertTriangle, Sparkles, Wand2 } from "lucide-react";
import { generateStory } from "./actions";

const FIELD_CLASS =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary disabled:opacity-50";
const LABEL_CLASS = "text-xs font-medium text-foreground";

export function GenerateForm({ hasNicheData }: { hasNicheData: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await generateStory(formData);
      // On success the action redirects server-side and never resolves here.
      if (result && !result.ok) {
        setError(result.error ?? "Couldn't generate a story.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 rounded-xl border border-border bg-elevated p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Wand2 className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Generate a draft story</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Creates a story with a full scene breakdown and starts a pipeline run, ready for
            review in Content Approval.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="topic" className={LABEL_CLASS}>
          Topic (optional)
        </label>
        <input
          id="topic"
          name="topic"
          type="text"
          disabled={isPending}
          placeholder="Leave blank to pick one for you"
          className={FIELD_CLASS}
        />
      </div>

      <label
        htmlFor="use_niche"
        className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2.5"
      >
        <span className="text-sm text-foreground">
          Use my niche &amp; keywords
          <span className="ml-1.5 block text-xs font-normal text-muted-foreground sm:inline sm:ml-1.5">
            {hasNicheData ? "Pulled from Content Strategy" : "No keywords set yet — see Content Strategy"}
          </span>
        </span>
        <input
          id="use_niche"
          name="use_niche"
          type="checkbox"
          disabled={isPending || !hasNicheData}
          defaultChecked={hasNicheData}
          className="h-4 w-4 shrink-0 accent-[var(--primary)] disabled:opacity-50"
        />
      </label>

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-[var(--status-failed)]/30 bg-[var(--status-failed)]/10 px-3 py-2 text-xs text-[var(--status-failed)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          <span>{error}</span>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
        {isPending ? "Generating…" : "Generate story ($0)"}
      </button>

      <p className="text-xs text-muted-foreground">
        Generation runs the real AI pipeline when enabled (paid) — this creates a draft at $0
        now, using a deterministic mock in place of the model call.
      </p>
    </form>
  );
}
