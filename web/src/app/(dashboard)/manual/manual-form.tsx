"use client";

import { useState, useTransition, type FormEvent } from "react";
import { AlertTriangle, PenLine, Plus } from "lucide-react";
import { addManualStory } from "./actions";

const FIELD_CLASS =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary disabled:opacity-50";
const LABEL_CLASS = "text-xs font-medium text-foreground";

interface CharacterOption {
  id: string;
  name: string;
}

export function ManualForm({ characters }: { characters: CharacterOption[] }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await addManualStory(formData);
      if (result && !result.ok) {
        setError(result.error ?? "Couldn't add this story.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 rounded-xl border border-border bg-elevated p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <PenLine className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Make a video from your own script</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Paste your narration and we build the video from it — your exact
            words become the voiceover and captions, and each line gets its own
            AI-generated scene. It goes straight into the pipeline to review.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="title" className={LABEL_CLASS}>
          Title / topic
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          disabled={isPending}
          placeholder="e.g. The Honest Woodcutter"
          className={FIELD_CLASS}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="script" className={LABEL_CLASS}>
          Script <span aria-hidden="true">*</span>
        </label>
        <textarea
          id="script"
          name="script"
          rows={8}
          required
          disabled={isPending}
          placeholder="Paste or write the full narration/script here…"
          className={`${FIELD_CLASS} resize-y`}
        />
        <span className="text-xs text-muted-foreground">
          Tip: a blank line between paragraphs starts a new scene — one image
          per beat.
        </span>
      </div>

      {characters.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="character_id" className={LABEL_CLASS}>
            Feature a character <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <select
            id="character_id"
            name="character_id"
            defaultValue=""
            disabled={isPending}
            className={FIELD_CLASS}
          >
            <option value="">No character — scenes only</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">
            Chosen, this character appears in every scene with the same face and
            speaks in their voice.
          </span>
        </div>
      ) : null}

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
        <Plus className="h-3.5 w-3.5" strokeWidth={2} />
        {isPending ? "Adding…" : "Add story"}
      </button>
    </form>
  );
}
