"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, Save } from "lucide-react";
import { updateModelRouting } from "./actions";

export interface ModelRoutingValue {
  image: { High: string; Medium: string; Low: string };
  motion: { premium: string; standard: string; cheap: string };
  thumbnail: string;
}

const FIELD_CLASS =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary disabled:opacity-50";
const LABEL_CLASS = "text-xs font-medium text-foreground";

function Field({
  id,
  name,
  label,
  defaultValue,
  disabled,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue: string;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="text"
        required
        disabled={disabled}
        defaultValue={defaultValue}
        className={FIELD_CLASS}
      />
    </div>
  );
}

export function ModelRoutingForm({ value }: { value: ModelRoutingValue }) {
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
      const result = await updateModelRouting(formData);
      if (!result.ok) {
        setError(result.error ?? "Couldn't save model routing.");
        return;
      }
      setSaved(true);
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="flex flex-col gap-6 rounded-xl border border-border bg-elevated p-5 shadow-sm"
    >
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-foreground">Image models</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field
            id="image_high"
            name="image_high"
            label="High"
            defaultValue={value.image.High}
            disabled={isPending}
          />
          <Field
            id="image_medium"
            name="image_medium"
            label="Medium"
            defaultValue={value.image.Medium}
            disabled={isPending}
          />
          <Field
            id="image_low"
            name="image_low"
            label="Low"
            defaultValue={value.image.Low}
            disabled={isPending}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-6">
        <h2 className="text-sm font-semibold text-foreground">Motion models</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field
            id="motion_premium"
            name="motion_premium"
            label="Premium"
            defaultValue={value.motion.premium}
            disabled={isPending}
          />
          <Field
            id="motion_standard"
            name="motion_standard"
            label="Standard"
            defaultValue={value.motion.standard}
            disabled={isPending}
          />
          <Field
            id="motion_cheap"
            name="motion_cheap"
            label="Cheap"
            defaultValue={value.motion.cheap}
            disabled={isPending}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-6">
        <h2 className="text-sm font-semibold text-foreground">Thumbnail model</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field
            id="thumbnail"
            name="thumbnail"
            label="Thumbnail"
            defaultValue={value.thumbnail}
            disabled={isPending}
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
          <span>Model routing saved.</span>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Save className="h-3.5 w-3.5" strokeWidth={2} />
        {isPending ? "Saving…" : "Save model routing"}
      </button>
    </form>
  );
}
