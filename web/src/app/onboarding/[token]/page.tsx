import { notFound, redirect } from "next/navigation";
import { loadOnboardingByToken } from "@/lib/onboarding/token";
import { loadActivePlans } from "@/lib/onboarding/plans";
import { getPlatformSettings } from "@/lib/branding";
import { OnboardingWizard } from "./onboarding-wizard";

// Token-gated, no session — always reads live via the service-role client.
export const dynamic = "force-dynamic";

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const onboarding = await loadOnboardingByToken(token);
  if (!onboarding) notFound();

  // Submitted/approved/rejected all have their own state on the waiting
  // page — the wizard itself is only for created/in_progress/changes_requested.
  if (["submitted", "approved", "rejected"].includes(onboarding.status)) {
    redirect(`/onboarding/${token}/waiting`);
  }

  const [platform, plans] = await Promise.all([getPlatformSettings(), loadActivePlans()]);

  return (
    <OnboardingWizard
      token={token}
      platformName={platform.platform_name}
      initialBusinessInfo={onboarding.business_info ?? {}}
      initialApiStatus={onboarding.api_status ?? {}}
      plans={plans}
      reviewerNotes={onboarding.status === "changes_requested" ? onboarding.notes : null}
    />
  );
}
