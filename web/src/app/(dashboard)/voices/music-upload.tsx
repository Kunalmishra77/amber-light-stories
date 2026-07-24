"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Music4 } from "lucide-react";
import { uploadMusicAction } from "./actions";

interface MusicUploadProps {
  /** Whether the workspace already has a music bed. */
  hasTrack: boolean;
}

/**
 * Uploads the channel's background-music bed. The renderer ducks it under the
 * narration automatically, so there is nothing to configure beyond the file.
 */
export function MusicUpload({ hasTrack }: MusicUploadProps) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setDone(false);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await uploadMusicAction(formData);
      if (!result.ok) {
        setError(result.error ?? "Couldn't upload the track.");
        return;
      }
      setDone(true);
      formRef.current?.reset();
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="rounded-xl border border-border bg-elevated p-5 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface">
          <Music4 className="h-5 w-5 text-accent" strokeWidth={2} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Background music</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Played quietly under the narration. Upload a track you have the
            rights to — a new upload replaces the old one for future videos.
          </p>
        </div>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        {hasTrack
          ? "A music bed is set for this channel."
          : "No music yet — videos render with narration only."}
      </p>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label htmlFor="music" className="sr-only">
          Music file
        </label>
        <input
          id="music"
          name="file"
          type="file"
          accept="audio/mpeg,audio/mp4,.mp3,.m4a"
          required
          disabled={pending}
          className="w-full cursor-pointer rounded-lg border border-border bg-surface px-3 py-2 text-xs text-foreground file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-elevated file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground disabled:opacity-50 sm:max-w-sm"
        />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-on-primary transition-colors duration-200 hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} /> : null}
          {pending ? "Uploading…" : "Upload track"}
        </button>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">MP3 or M4A, up to 20 MB.</p>

      {error ? (
        <p className="mt-3 flex items-start gap-2 text-xs text-[var(--status-failed)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          <span>{error}</span>
        </p>
      ) : null}

      {done && !error ? (
        <p className="mt-3 flex items-center gap-2 text-xs text-[var(--status-approved)]">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          <span>Uploaded — future videos will use this track.</span>
        </p>
      ) : null}
    </form>
  );
}
