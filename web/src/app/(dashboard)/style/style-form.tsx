"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { AlertTriangle, Plus } from "lucide-react";
import { addStyleReference } from "./actions";

export function StyleForm() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await addStyleReference(formData);
      if (!result.ok) {
        setError(result.error ?? "Couldn't add this style reference.");
        return;
      }
      formRef.current?.reset();
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-xl border border-border bg-elevated p-5 shadow-sm"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="style-name" className="text-xs font-medium text-foreground">
          Name
        </label>
        <input
          id="style-name"
          name="name"
          type="text"
          required
          disabled={isPending}
          placeholder="e.g. Cinematic warm-tone fables"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary disabled:opacity-50"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="style-urls" className="text-xs font-medium text-foreground">
          YouTube URLs (one per line)
        </label>
        <textarea
          id="style-urls"
          name="urls"
          rows={4}
          required
          disabled={isPending}
          placeholder={"https://www.youtube.com/watch?v=...\nhttps://www.youtube.com/watch?v=..."}
          className="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary disabled:opacity-50"
        />
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-[var(--status-failed)]/30 bg-[var(--status-failed)]/10 px-3 py-2 text-xs text-[var(--status-failed)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          <span>{error}</span>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2} />
        {isPending ? "Adding…" : "Add style reference"}
      </button>
    </form>
  );
}
