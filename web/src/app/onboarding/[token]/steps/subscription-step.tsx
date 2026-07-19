"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, CreditCard, Lock } from "lucide-react";
import { saveSelectedPlanAction } from "../actions";
import type { PlanRow } from "@/lib/onboarding/types";

const LIMIT_LABELS: Record<string, string> = {
  videos_month: "Videos / month",
  ai_credits: "AI credits / month",
};

function limitLabel(key: string): string {
  return LIMIT_LABELS[key] ?? key.replace(/_/g, " ");
}

function formatPrice(price: number | null): string {
  if (!price) return "Free";
  return `$${price}/mo`;
}

interface SubscriptionStepProps {
  token: string;
  plans: PlanRow[];
  initialPlan?: string;
  onSelected: (planSlug: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export function SubscriptionStep({ token, plans, initialPlan, onSelected, onNext, onBack }: SubscriptionStepProps) {
  const [selected, setSelected] = useState<string | undefined>(initialPlan);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleContinue() {
    if (!selected) {
      setError("Pick a plan to continue — you can change it any time later.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await saveSelectedPlanAction(token, selected);
      if (!result.ok) {
        setError(result.error ?? "Couldn't save your plan choice.");
        return;
      }
      onSelected(selected);
      onNext();
    });
  }

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-border bg-elevated p-6 shadow-xl shadow-black/5 dark:shadow-black/40 sm:p-8">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-foreground">Choose your plan</h2>
        <p className="text-sm text-muted-foreground">
          Start free and grow whenever you&rsquo;re ready — you can change plans any time from Billing.
        </p>
      </div>

      {plans.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-surface/60 p-4 text-xs text-muted-foreground">
          No plans are published yet — pick this up later from Billing. You can continue without selecting one.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {plans.map((plan) => {
            const isSelected = selected === plan.slug;
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelected(plan.slug)}
                className={`flex flex-col gap-3 rounded-xl border p-5 text-left transition-colors ${
                  isSelected
                    ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                    : "border-border bg-surface hover:border-primary/30"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-semibold text-foreground">{plan.name}</span>
                    <span className="text-xl font-semibold tabular-nums tracking-tight text-foreground">
                      {formatPrice(plan.price_month)}
                    </span>
                  </div>
                  {isSelected ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" strokeWidth={2} />
                  ) : (
                    <div className="h-5 w-5 shrink-0 rounded-full border border-border" />
                  )}
                </div>
                {plan.limits && Object.keys(plan.limits).length > 0 ? (
                  <ul className="flex flex-col gap-1">
                    {Object.entries(plan.limits).map(([key, value]) => (
                      <li key={key} className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{limitLabel(key)}</span>
                        <span className="font-medium text-foreground">{String(value)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border bg-surface/40 p-5">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
          <span className="text-sm font-medium text-foreground">Payment</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Billing activates soon — you can start on Free today and upgrade later with no interruption to your
          content pipeline.
        </p>
        <button
          type="button"
          disabled
          title="Coming soon"
          className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-border bg-elevated px-3.5 py-2 text-xs font-medium text-muted-foreground opacity-60"
        >
          <Lock className="h-3.5 w-3.5" strokeWidth={1.75} />
          Proceed to payment
        </button>
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
          disabled={isPending}
          onClick={handleContinue}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Continue"}
        </button>
      </div>
    </div>
  );
}
