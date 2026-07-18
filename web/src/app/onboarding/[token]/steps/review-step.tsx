"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { submitOnboardingAction } from "../actions";
import { REQUIRED_PROVIDERS, type ApiStatus, type BusinessInfo } from "@/lib/onboarding/types";

const FIELD_LABELS: Record<keyof BusinessInfo, string> = {
  business_name: "Business name",
  brand_name: "Brand name",
  website: "Website",
  country: "Country",
  timezone: "Timezone",
  target_audience: "Target audience",
  industry: "Industry",
  language: "Language",
  secondary_language: "Secondary language",
  brand_description: "Brand description",
  business_goals: "Business goals",
  content_style: "Content style",
  target_platform: "Target platform",
  upload_frequency: "Upload frequency",
  brand_colors: "Brand colors",
  tone: "Tone",
  competitors: "Competitors",
  keywords: "Keywords",
  negative_keywords: "Negative keywords",
  cta_style: "CTA style",
  content_objective: "Content objective",
};

interface ReviewStepProps {
  token: string;
  businessInfo: BusinessInfo;
  apiStatus: ApiStatus;
  onBack: () => void;
  onSubmitted: () => void;
}

export function ReviewStep({ token, businessInfo, apiStatus, onBack, onSubmitted }: ReviewStepProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const missing = REQUIRED_PROVIDERS.filter((p) => apiStatus[p]?.status !== "connected");
  const canSubmit = missing.length === 0 && !!businessInfo.business_name;

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await submitOnboardingAction(token);
      if (!result.ok) {
        setError(result.error ?? "Couldn't submit.");
        return;
      }
      onSubmitted();
    });
  }

  const entries = (Object.keys(FIELD_LABELS) as (keyof BusinessInfo)[])
    .map((key) => [FIELD_LABELS[key], businessInfo[key]] as const)
    .filter(([, value]) => !!value);

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-border bg-elevated p-6 shadow-xl shadow-black/5 dark:shadow-black/40 sm:p-8">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-foreground">Review & submit</h2>
        <p className="text-sm text-muted-foreground">
          Double-check everything, then submit for Super Admin approval.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Business info</h3>
        {entries.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nothing filled in yet.</p>
        ) : (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            {entries.map(([label, value]) => (
              <div key={label} className="flex flex-col gap-0.5">
                <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
                <dd className="break-words text-sm text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">API status</h3>
        <div className="flex flex-wrap gap-2">
          {REQUIRED_PROVIDERS.map((p) => {
            const connected = apiStatus[p]?.status === "connected";
            return (
              <span
                key={p}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                  connected
                    ? "border-[var(--status-approved)]/30 text-[var(--status-approved)]"
                    : "border-[var(--status-failed)]/30 text-[var(--status-failed)]"
                }`}
              >
                {connected ? (
                  <CheckCircle2 className="h-3 w-3" strokeWidth={2} />
                ) : (
                  <XCircle className="h-3 w-3" strokeWidth={2} />
                )}
                {p}
              </span>
            );
          })}
        </div>
        {missing.length > 0 ? (
          <p className="text-xs text-muted-foreground">Go back and connect: {missing.join(", ")}.</p>
        ) : null}
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-[var(--status-failed)]/30 bg-[var(--status-failed)]/10 px-3 py-2 text-xs text-[var(--status-failed)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Back
        </button>
        <button
          type="button"
          disabled={!canSubmit || isPending}
          onClick={handleSubmit}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Submitting…" : "Submit for approval"}
        </button>
      </div>
    </div>
  );
}
