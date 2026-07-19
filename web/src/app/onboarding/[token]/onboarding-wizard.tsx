"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, MessageSquareWarning } from "lucide-react";
import { cn } from "@/lib/utils";
import { saveBusinessInfoAction } from "./actions";
import { WelcomeStep } from "./steps/welcome-step";
import { BusinessInfoStep } from "./steps/business-info-step";
import { ApiCredentialsStep } from "./steps/api-credentials-step";
import { SubscriptionStep } from "./steps/subscription-step";
import { ReviewStep } from "./steps/review-step";
import type { ApiStatus, BusinessInfo, CredentialProvider, PlanRow } from "@/lib/onboarding/types";

const STEPS = [
  { n: 1, label: "Business info" },
  { n: 2, label: "API setup" },
  { n: 3, label: "Subscription" },
  { n: 4, label: "Review & submit" },
] as const;

interface OnboardingWizardProps {
  token: string;
  platformName: string;
  initialBusinessInfo: BusinessInfo;
  initialApiStatus: ApiStatus;
  plans: PlanRow[];
  reviewerNotes?: string | null;
}

export function OnboardingWizard({
  token,
  platformName,
  initialBusinessInfo,
  initialApiStatus,
  plans,
  reviewerNotes,
}: OnboardingWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [businessInfo, setBusinessInfo] = useState<BusinessInfo>(initialBusinessInfo);
  const [apiStatus, setApiStatus] = useState<ApiStatus>(initialApiStatus);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleBusinessInfoSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await saveBusinessInfoAction(token, formData);
      if (!result.ok || !result.info) {
        setError(result.error ?? "Couldn't save business info.");
        return;
      }
      setBusinessInfo(result.info);
      setStep(2);
    });
  }

  function handleStatusChange(provider: CredentialProvider, result: { status: string; message: string }) {
    setApiStatus((prev) => ({
      ...prev,
      [provider]: { status: result.status, message: result.message, checkedAt: new Date().toISOString() },
    }));
  }

  function handlePlanSelected(planSlug: string) {
    setBusinessInfo((prev) => ({ ...prev, selected_plan: planSlug }));
  }

  return (
    <div className="flex w-full max-w-3xl flex-col gap-8">
      {step > 0 ? <StepIndicator current={step} /> : null}

      {reviewerNotes ? (
        <div className="flex items-start gap-2 rounded-lg border border-[var(--status-paused)]/30 bg-[var(--status-paused)]/10 px-4 py-3 text-sm text-[var(--status-paused)]">
          <MessageSquareWarning className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
          <span>
            <strong className="font-semibold">Changes requested:</strong> {reviewerNotes}
          </span>
        </div>
      ) : null}

      {step === 0 ? (
        <WelcomeStep platformName={platformName} onNext={() => setStep(1)} />
      ) : step === 1 ? (
        <BusinessInfoStep
          defaultValues={businessInfo}
          isPending={isPending}
          error={error}
          onSubmit={handleBusinessInfoSubmit}
        />
      ) : step === 2 ? (
        <ApiCredentialsStep
          token={token}
          apiStatus={apiStatus}
          onStatusChange={handleStatusChange}
          onNext={() => setStep(3)}
          onBack={() => setStep(1)}
        />
      ) : step === 3 ? (
        <SubscriptionStep
          token={token}
          plans={plans}
          initialPlan={businessInfo.selected_plan}
          onSelected={handlePlanSelected}
          onNext={() => setStep(4)}
          onBack={() => setStep(2)}
        />
      ) : (
        <ReviewStep
          token={token}
          businessInfo={businessInfo}
          apiStatus={apiStatus}
          plans={plans}
          onBack={() => setStep(3)}
          onSubmitted={() => router.push(`/onboarding/${token}/waiting`)}
        />
      )}
    </div>
  );
}

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center">
      {STEPS.map((s, i) => (
        <div key={s.n} className="flex items-center">
          <div className="flex flex-col items-center gap-1.5">
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold transition-colors duration-200",
                current === s.n
                  ? "border-primary bg-primary text-on-primary"
                  : current > s.n
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-surface text-muted-foreground"
              )}
            >
              {current > s.n ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : s.n}
            </div>
            <span
              className={cn(
                "hidden text-[11px] font-medium sm:inline",
                current === s.n ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {s.label}
            </span>
          </div>
          {i < STEPS.length - 1 ? <div className="mx-2 mb-5 h-px w-10 bg-border sm:w-16" /> : null}
        </div>
      ))}
    </div>
  );
}
