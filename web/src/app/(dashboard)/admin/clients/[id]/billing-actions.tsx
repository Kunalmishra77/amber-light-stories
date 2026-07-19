"use client";

import { useState, useTransition, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, Coins, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";
import { addCreditsAction, assignPlanAction } from "../actions";

const FIELD_CLASS =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary disabled:opacity-50";

export interface PlanOption {
  id: string;
  name: string;
}

interface BillingActionsProps {
  tenantId: string;
  plans: PlanOption[];
  currentPlanId: string | null;
  creditsBalance: number;
}

export function BillingActions({
  tenantId,
  plans,
  currentPlanId,
  creditsBalance,
}: BillingActionsProps) {
  const [planError, setPlanError] = useState<string | null>(null);
  const [planSaved, setPlanSaved] = useState(false);
  const [isPlanPending, startPlanTransition] = useTransition();

  const [creditsError, setCreditsError] = useState<string | null>(null);
  const [creditsSaved, setCreditsSaved] = useState(false);
  const [isCreditsPending, startCreditsTransition] = useTransition();

  function handleAssignPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPlanError(null);
    setPlanSaved(false);
    const formData = new FormData(event.currentTarget);
    const planId = (formData.get("plan_id") as string | null) ?? "";

    startPlanTransition(async () => {
      const result = await assignPlanAction(tenantId, planId);
      if (!result.ok) {
        setPlanError(result.error ?? "Couldn't assign plan.");
        return;
      }
      setPlanSaved(true);
      setTimeout(() => setPlanSaved(false), 2500);
    });
  }

  function handleAddCredits(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreditsError(null);
    setCreditsSaved(false);
    const formData = new FormData(event.currentTarget);

    startCreditsTransition(async () => {
      const result = await addCreditsAction(tenantId, formData);
      if (!result.ok) {
        setCreditsError(result.error ?? "Couldn't add credits.");
        return;
      }
      setCreditsSaved(true);
      (event.target as HTMLFormElement).reset();
      setTimeout(() => setCreditsSaved(false), 2500);
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-elevated p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-foreground">Billing</h2>

      <form onSubmit={handleAssignPlan} className="flex flex-col gap-2">
        <label className="text-xs font-medium text-foreground">Assign plan</label>
        <div className="flex items-center gap-2">
          <select
            name="plan_id"
            defaultValue={currentPlanId ?? ""}
            disabled={isPlanPending}
            className={FIELD_CLASS}
          >
            <option value="" disabled>
              Choose a plan…
            </option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={isPlanPending}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CreditCard className="h-3.5 w-3.5" strokeWidth={2} />
            {isPlanPending ? "Saving…" : "Assign"}
          </button>
        </div>
        {planError ? (
          <div className="flex items-start gap-1.5 text-xs text-[var(--status-failed)]">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2} />
            <span>{planError}</span>
          </div>
        ) : null}
        {planSaved && !planError ? (
          <div className="flex items-start gap-1.5 text-xs text-[var(--status-approved)]">
            <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2} />
            <span>Plan assigned.</span>
          </div>
        ) : null}
      </form>

      <div className="border-t border-border pt-4">
        <form onSubmit={handleAddCredits} className="flex flex-col gap-2">
          <label className="text-xs font-medium text-foreground">
            Add credits{" "}
            <span className="font-normal text-muted-foreground">
              (balance: {creditsBalance.toLocaleString()})
            </span>
          </label>
          <div className="flex items-center gap-2">
            <input
              name="delta"
              type="number"
              step="1"
              placeholder="e.g. 100 or -50"
              disabled={isCreditsPending}
              className={cn(FIELD_CLASS, "tabular-nums")}
            />
            <input
              name="reason"
              type="text"
              placeholder="Reason"
              disabled={isCreditsPending}
              className={FIELD_CLASS}
            />
            <button
              type="submit"
              disabled={isCreditsPending}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Coins className="h-3.5 w-3.5" strokeWidth={2} />
              {isCreditsPending ? "Adding…" : "Add"}
            </button>
          </div>
          {creditsError ? (
            <div className="flex items-start gap-1.5 text-xs text-[var(--status-failed)]">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2} />
              <span>{creditsError}</span>
            </div>
          ) : null}
          {creditsSaved && !creditsError ? (
            <div className="flex items-start gap-1.5 text-xs text-[var(--status-approved)]">
              <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2} />
              <span>Credits updated.</span>
            </div>
          ) : null}
        </form>
      </div>
    </div>
  );
}
