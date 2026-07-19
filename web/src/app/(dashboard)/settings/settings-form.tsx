"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Save } from "lucide-react";

export interface SettingsActionResult {
  ok: boolean;
  error?: string;
}

interface SettingsFormProps {
  action: (formData: FormData) => Promise<SettingsActionResult>;
  canEdit: boolean;
  savedMessage?: string;
  children: ReactNode;
}

/** Shared submit/error/saved chrome for every Settings section form — mirrors
 * the pattern in brand/brand-form.tsx and settings/project-settings-form.tsx
 * so every section behaves identically. */
export function SettingsForm({ action, canEdit, savedMessage = "Saved.", children }: SettingsFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await action(formData);
      if (!result.ok) {
        setError(result.error ?? "Couldn't save this section.");
        return;
      }
      setSaved(true);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <fieldset disabled={!canEdit || isPending} className="contents">
        {children}
      </fieldset>

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-[var(--status-failed)]/30 bg-[var(--status-failed)]/10 px-3 py-2 text-xs text-[var(--status-failed)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          <span>{error}</span>
        </div>
      ) : null}

      {saved && !error ? (
        <div className="flex items-start gap-2 rounded-lg border border-[var(--status-approved)]/30 bg-[var(--status-approved)]/10 px-3 py-2 text-xs text-[var(--status-approved)]">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          <span>{savedMessage}</span>
        </div>
      ) : null}

      {canEdit ? (
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" strokeWidth={2} />
          {isPending ? "Saving…" : "Save"}
        </button>
      ) : (
        <p className="text-xs text-muted-foreground">Only owners or managers can edit this section.</p>
      )}
    </form>
  );
}
