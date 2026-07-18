"use client";

import { useState, useTransition, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { stageLabel } from "@/lib/pipeline/stage-content";
import { updateProjectSettings } from "./actions";

const FIELD_CLASS =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary disabled:opacity-50";
const LABEL_CLASS = "text-xs font-medium text-foreground";

export interface ProjectSettingsData {
  id: string;
  per_video_budget_usd: number | null;
  language: string | null;
  target_seconds: number | null;
  aspect_ratio: string | null;
  niche: string | null;
  auto_approve: Record<string, boolean> | null;
}

export function ProjectSettingsForm({
  project,
  stages,
}: {
  project: ProjectSettingsData;
  stages: readonly string[];
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
      const result = await updateProjectSettings(formData);
      if (!result.ok) {
        setError(result.error ?? "Couldn't save settings.");
        return;
      }
      setSaved(true);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8">
      <input type="hidden" name="id" value={project.id} />

      <div className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-elevated p-5 shadow-sm sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
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
            defaultValue={project.per_video_budget_usd ?? 1.55}
            className={cn(FIELD_CLASS, "tabular-nums")}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="language" className={LABEL_CLASS}>
            Language
          </label>
          <select
            id="language"
            name="language"
            required
            disabled={isPending}
            defaultValue={project.language ?? "en"}
            className={FIELD_CLASS}
          >
            <option value="en">English</option>
            <option value="hi">Hindi</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="target_seconds" className={LABEL_CLASS}>
            Target duration (seconds)
          </label>
          <input
            id="target_seconds"
            name="target_seconds"
            type="number"
            step="1"
            min="1"
            required
            disabled={isPending}
            defaultValue={project.target_seconds ?? 45}
            className={cn(FIELD_CLASS, "tabular-nums")}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="aspect_ratio" className={LABEL_CLASS}>
            Aspect ratio
          </label>
          <select
            id="aspect_ratio"
            name="aspect_ratio"
            required
            disabled={isPending}
            defaultValue={project.aspect_ratio ?? "9:16"}
            className={FIELD_CLASS}
          >
            <option value="9:16">9:16 (vertical)</option>
            <option value="16:9">16:9 (horizontal)</option>
            <option value="1:1">1:1 (square)</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="niche" className={LABEL_CLASS}>
            Niche
          </label>
          <input
            id="niche"
            name="niche"
            type="text"
            disabled={isPending}
            defaultValue={project.niche ?? ""}
            placeholder="e.g. Indian moral stories (Panchatantra-style fables)"
            className={FIELD_CLASS}
          />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-elevated">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">
            Auto-approval matrix
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Stages with auto-approve OFF pause for your review.
          </p>
        </div>
        <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-y-0">
          {stages.map((stage, i) => {
            const checked = project.auto_approve?.[stage] ?? false;
            return (
              <label
                key={stage}
                htmlFor={`auto_${stage}`}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-3 px-5 py-3 text-sm text-foreground",
                  "border-border sm:border-b",
                  i % 2 === 0 ? "sm:border-r" : ""
                )}
              >
                {stageLabel(stage)}
                <input
                  id={`auto_${stage}`}
                  name={`auto_${stage}`}
                  type="checkbox"
                  disabled={isPending}
                  defaultChecked={checked}
                  className="h-4 w-4 shrink-0 accent-[var(--primary)] disabled:opacity-50"
                />
              </label>
            );
          })}
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
          <span>Project settings saved.</span>
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
