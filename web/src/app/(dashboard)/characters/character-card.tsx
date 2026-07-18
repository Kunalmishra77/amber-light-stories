"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { AlertTriangle, UploadCloud, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { uploadCharacterReference } from "./actions";

export interface CharacterCardData {
  id: string;
  name: string;
  role: string | null;
  source: string | null;
  ethnicity: string | null;
  gender: string | null;
}

interface CharacterCardProps {
  character: CharacterCardData;
  imageUrl: string | null;
}

const ROLE_STYLES: Record<string, string> = {
  primary: "border-primary/30 bg-primary/10 text-primary",
  secondary: "border-blue-500/30 bg-blue-500/10 text-blue-400",
  extra: "border-border bg-surface text-muted-foreground",
};

export function CharacterCard({ character, imageUrl }: CharacterCardProps) {
  const [preview, setPreview] = useState<string | null>(imageUrl);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const roleKey = character.role ?? "extra";
  const roleStyle = ROLE_STYLES[roleKey] ?? ROLE_STYLES.extra;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError("Choose an image file to upload.");
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);

    startTransition(async () => {
      const result = await uploadCharacterReference(character.id, formData);
      if (!result.ok) {
        setError(result.error ?? "Upload failed. Please try again.");
        setPreview(imageUrl);
        return;
      }
      formRef.current?.reset();
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-elevated p-5 shadow-sm transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/30">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-foreground">
            {character.name}
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                roleStyle
              )}
            >
              {roleKey}
            </span>
            {character.source ? (
              <span className="inline-flex items-center rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {character.source}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="relative aspect-square w-full overflow-hidden rounded-lg border border-border bg-surface">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL, not a local/static asset
          <img
            src={preview}
            alt={`${character.name} reference`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <User className="h-8 w-8" strokeWidth={1.5} />
            <span className="text-xs">No reference photo</span>
          </div>
        )}
      </div>

      {preview ? (
        <p className="text-xs text-muted-foreground">
          Master reference — reused across every scene &amp; video.
        </p>
      ) : null}

      <dl className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-muted-foreground">Gender</dt>
          <dd className="mt-0.5 font-medium capitalize text-foreground">
            {character.gender ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Ethnicity</dt>
          <dd className="mt-0.5 font-medium capitalize text-foreground">
            {character.ethnicity ?? "—"}
          </dd>
        </div>
      </dl>

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="flex flex-col gap-2 border-t border-border pt-3"
      >
        <input
          type="file"
          name="file"
          accept="image/*"
          disabled={isPending}
          className="w-full text-xs text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary hover:file:bg-primary/15 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
        >
          <UploadCloud className="h-3.5 w-3.5" strokeWidth={1.75} />
          {isPending
            ? "Uploading…"
            : preview
              ? "Replace reference photo"
              : "Upload reference photo"}
        </button>
      </form>

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-[var(--status-failed)]/30 bg-[var(--status-failed)]/10 px-3 py-2 text-xs text-[var(--status-failed)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          <span>{error}</span>
        </div>
      ) : null}
    </div>
  );
}
