import { notFound, redirect } from "next/navigation";
import { loadOnboardingByToken } from "@/lib/onboarding/token";
import { WaitingPoller } from "./waiting-poller";

export const dynamic = "force-dynamic";

export default async function OnboardingWaitingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const onboarding = await loadOnboardingByToken(token);
  if (!onboarding) notFound();

  // Not submitted yet — send them back to fill out the wizard.
  if (onboarding.status === "created" || onboarding.status === "in_progress") {
    redirect(`/onboarding/${token}`);
  }

  const businessInfo = onboarding.business_info ?? {};

  return (
    <WaitingPoller
      token={token}
      initialStatus={onboarding.status}
      initialNotes={onboarding.notes}
      businessName={businessInfo.business_name || "Your business"}
      ownerEmail={onboarding.owner_email}
    />
  );
}
