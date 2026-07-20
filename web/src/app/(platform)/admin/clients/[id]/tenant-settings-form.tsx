"use client";

import { useState, useTransition, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { updateTenantSettingsAction } from "../actions";

const FIELD_CLASS =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary disabled:opacity-50";
const LABEL_CLASS = "text-xs font-medium text-foreground";

export interface TenantSettingsData {
  country: string | null;
  timezone: string | null;
  language: string | null;
  industry: string | null;
  per_video_budget_usd: number | null;
}

export function TenantSettingsForm({
  tenantId,
  settings,
}: {
  tenantId: string;
  settings: TenantSettingsData;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await updateTenantSettingsAction(tenantId, formData);
      if (!result.ok) {
        setError(result.error ?? "Couldn't save client settings.");
        return;
      }
      setSaved(true);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-xl border border-border bg-elevated p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-foreground">Client settings</h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="country" className={LABEL_CLASS}>
            Country
          </label>
          <input
            id="country"
            name="country"
            type="text"
            disabled={isPending}
            defaultValue={settings.country ?? ""}
            className={FIELD_CLASS}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="timezone" className={LABEL_CLASS}>
            Timezone
          </label>
          <input
            id="timezone"
            name="timezone"
            type="text"
            disabled={isPending}
            defaultValue={settings.timezone ?? "UTC"}
            className={FIELD_CLASS}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="language" className={LABEL_CLASS}>
            Language
          </label>
          <select
            id="language"
            name="language"
            disabled={isPending}
            defaultValue={settings.language ?? "en"}
            className={FIELD_CLASS}
          >
            <option value="en">English</option>
            <option value="hi">Hindi</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="industry" className={LABEL_CLASS}>
            Industry
          </label>
          <input
            id="industry"
            name="industry"
            type="text"
            disabled={isPending}
            defaultValue={settings.industry ?? ""}
            className={FIELD_CLASS}
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="per_video_budget_usd" className={LABEL_CLASS}>
            Per-video budget (USD)
          </label>
          <input
            id="per_video_budget_usd"
            name="per_video_budget_usd"
            type="number"
            step="0.01"
            min="0"
            required
            disabled={isPending}
            defaultValue={settings.per_video_budget_usd ?? 1.55}
            className={cn(FIELD_CLASS, "tabular-nums")}
          />
        </div>
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
          <span>Client settings saved.</span>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Save className="h-3.5 w-3.5" strokeWidth={2} />
        {isPending ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
