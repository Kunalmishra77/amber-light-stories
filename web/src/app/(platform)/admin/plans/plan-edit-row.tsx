"use client";

import { useState, useTransition, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { updatePlanAction } from "./actions";

const FIELD_CLASS =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary disabled:opacity-50";

export interface PlanEditRowData {
  id: string;
  name: string;
  slug: string | null;
  price_month: number | null;
  limits: Record<string, unknown> | null;
  features: Record<string, unknown> | null;
  active: boolean | null;
  sort: number | null;
}

export function PlanEditRow({ plan }: { plan: PlanEditRowData }) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await updatePlanAction(plan.id, formData);
      if (!result.ok) {
        setError(result.error ?? "Couldn't save this plan.");
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-xl border border-border bg-elevated p-5 shadow-sm"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-xs text-muted-foreground">{plan.slug ?? "—"}</span>
        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-foreground">
          <input
            type="checkbox"
            name="active"
            defaultChecked={plan.active ?? true}
            disabled={isPending}
            className="h-4 w-4 accent-[var(--primary)]"
          />
          Active
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-foreground">Name</label>
          <input
            name="name"
            type="text"
            required
            disabled={isPending}
            defaultValue={plan.name}
            className={FIELD_CLASS}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-foreground">Price / month (USD)</label>
          <input
            name="price_month"
            type="number"
            step="1"
            min="0"
            disabled={isPending}
            defaultValue={plan.price_month ?? 0}
            className={cn(FIELD_CLASS, "tabular-nums")}
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label className="text-xs font-medium text-foreground">Limits (JSON)</label>
          <textarea
            name="limits"
            rows={2}
            disabled={isPending}
            defaultValue={JSON.stringify(plan.limits ?? {}, null, 0)}
            className={cn(FIELD_CLASS, "font-mono text-xs")}
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label className="text-xs font-medium text-foreground">Features (JSON)</label>
          <textarea
            name="features"
            rows={2}
            disabled={isPending}
            defaultValue={JSON.stringify(plan.features ?? {}, null, 0)}
            className={cn(FIELD_CLASS, "font-mono text-xs")}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-foreground">Sort order</label>
          <input
            name="sort"
            type="number"
            step="1"
            disabled={isPending}
            defaultValue={plan.sort ?? 0}
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
          <span>Plan saved.</span>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Save className="h-3.5 w-3.5" strokeWidth={2} />
        {isPending ? "Saving…" : "Save plan"}
      </button>
    </form>
  );
}
