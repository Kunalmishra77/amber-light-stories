import { ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { getProfile } from "@/lib/auth";

// Reads the current user's profile on every request.
export const dynamic = "force-dynamic";

export default async function AdminPortalPage() {
  const profile = await getProfile();

  return (
    <div>
      <PageHeader
        title="Platform Admin"
        description="Cross-tenant administration for Amber Light Stories."
      />

      {!profile?.is_super_admin ? (
        <EmptyState
          icon={ShieldCheck}
          title="Super admin access required"
          description="This portal is only available to platform super admins."
        />
      ) : (
        <EmptyState
          icon={ShieldCheck}
          title="Coming in S2"
          description="Client management, onboarding review, platform settings, and impersonation land in the next build phase."
        />
      )}
    </div>
  );
}
