"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, Loader2, UserPlus } from "lucide-react";
import { createCharacter } from "./actions";

const FIELD =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary disabled:opacity-50";
const LABEL = "text-xs font-medium text-foreground";

/**
 * Creates a recurring character. The appearance fields are what keep them
 * looking like the same person in every scene and every video — the render
 * pipeline builds one description from them and pins a fixed seed to it.
 */
export function CreateCharacterForm() {
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setCreated(null);
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "").trim();

    startTransition(async () => {
      const result = await createCharacter(formData);
      if (!result.ok) {
        setError(result.error ?? "Couldn't create the character.");
        return;
      }
      setCreated(name);
      formRef.current?.reset();
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-xl border border-border bg-elevated p-5 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface">
          <UserPlus className="h-5 w-5 text-primary" strokeWidth={2} aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Add a character</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Describe them once. Every scene they appear in — in this video and
            the next — is generated from that same description, so they stay
            recognisable.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="name" className={LABEL}>
            Name <span aria-hidden="true">*</span>
          </label>
          <input
            id="name"
            name="name"
            required
            disabled={pending}
            placeholder="e.g. Mira"
            className={FIELD}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="role" className={LABEL}>
            Role
          </label>
          <select id="role" name="role" defaultValue="primary" disabled={pending} className={FIELD}>
            <option value="primary">Primary</option>
            <option value="secondary">Secondary</option>
            <option value="extra">Extra</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="style" className={LABEL}>
            Art style
          </label>
          <input
            id="style"
            name="style"
            disabled={pending}
            placeholder="e.g. warm storybook illustration"
            className={FIELD}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="identity" className={LABEL}>
            Who they are
          </label>
          <input
            id="identity"
            name="identity"
            disabled={pending}
            placeholder="e.g. a village storyteller in her sixties"
            className={FIELD}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="face" className={LABEL}>
            Face
          </label>
          <input
            id="face"
            name="face"
            disabled={pending}
            placeholder="e.g. round face, warm eyes, deep smile lines"
            className={FIELD}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="hair" className={LABEL}>
            Hair
          </label>
          <input
            id="hair"
            name="hair"
            disabled={pending}
            placeholder="e.g. long silver hair in a loose braid"
            className={FIELD}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="clothes" className={LABEL}>
            Clothing
          </label>
          <input
            id="clothes"
            name="clothes"
            disabled={pending}
            placeholder="e.g. indigo shawl over a cream kurta"
            className={FIELD}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="gender" className={LABEL}>
            Gender
          </label>
          <input id="gender" name="gender" disabled={pending} placeholder="Optional" className={FIELD} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ethnicity" className={LABEL}>
            Ethnicity
          </label>
          <input
            id="ethnicity"
            name="ethnicity"
            disabled={pending}
            placeholder="Optional"
            className={FIELD}
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        The more specific the description, the more consistent the character.
        Vague words like &quot;a woman&quot; give the model room to change them
        between scenes.
      </p>

      {error ? (
        <p className="flex items-start gap-2 text-xs text-[var(--status-failed)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          <span>{error}</span>
        </p>
      ) : null}

      {created && !error ? (
        <p className="flex items-center gap-2 text-xs text-[var(--status-approved)]">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          <span>
            <strong className="font-medium">{created}</strong> added — they&apos;ll
            stay consistent across scenes and videos.
          </span>
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-on-primary transition-colors duration-200 hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} /> : null}
        {pending ? "Adding…" : "Add character"}
      </button>
    </form>
  );
}
