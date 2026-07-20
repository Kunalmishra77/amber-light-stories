"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, Plus } from "lucide-react";
import { createAnnouncementAction } from "./actions";

const FIELD_CLASS =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary disabled:opacity-50";
const LABEL_CLASS = "text-xs font-medium text-foreground";

export function CreateAnnouncementForm() {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await createAnnouncementAction(formData);
      if (!result.ok) {
        setError(result.error ?? "Couldn't create announcement.");
        return;
      }
      setSaved(true);
      formRef.current?.reset();
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-xl border border-border bg-elevated p-5 shadow-sm"
    >
      <h2 className="text-sm font-semibold text-foreground">New announcement</h2>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="title" className={LABEL_CLASS}>
          Title
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          disabled={isPending}
          className={FIELD_CLASS}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="body" className={LABEL_CLASS}>
          Body
        </label>
        <textarea
          id="body"
          name="body"
          required
          rows={3}
          disabled={isPending}
          className={FIELD_CLASS}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="audience" className={LABEL_CLASS}>
            Audience
          </label>
          <select
            id="audience"
            name="audience"
            disabled={isPending}
            defaultValue="all"
            className={FIELD_CLASS}
          >
            <option value="all">All</option>
            <option value="tenants">Tenants</option>
            <option value="internal">Internal</option>
          </select>
        </div>
        <label htmlFor="active" className="flex items-center gap-2 pt-6 text-xs font-medium text-foreground">
          <input
            id="active"
            name="active"
            type="checkbox"
            defaultChecked
            disabled={isPending}
            className="h-4 w-4 accent-[var(--primary)] disabled:opacity-50"
          />
          Active immediately
        </label>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-[var(--status-failed)]/30 bg-[var(--status-failed)]/10 px-3 py-2 text-xs text-[var(--status-failed)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          <span>{error}</span>
        </div>
      ) : null}

      {saved && !error ? (
        <div className="flex items-start gap-2 rounded-lg border border-[var(--status-approved)]/30 bg-[var(--status-approved)]/10 px-3 py-2 text-xs text-[var(--status-approved)]">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          <span>Announcement created.</span>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2} />
        {isPending ? "Publishing…" : "Publish announcement"}
      </button>
    </form>
  );
}
