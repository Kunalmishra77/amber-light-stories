import { ClipboardCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { StatusBadge, type PipelineStatus } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { REQUIRED_PROVIDERS, type ApiStatus, type BusinessInfo } from "@/lib/onboarding/types";
import { ReviewActions } from "./review-actions";

// Cross-tenant review queue — reads live on every request.
export const dynamic = "force-dynamic";

const ONBOARDING_STATUS_BADGE: Record<string, PipelineStatus> = {
  created: "pending",
  in_progress: "running",
  submitted: "awaiting_review",
  approved: "approved",
  rejected: "rejected",
  changes_requested: "paused",
};

const STATUS_PRIORITY: Record<string, number> = {
  submitted: 0,
  changes_requested: 1,
  in_progress: 2,
  created: 3,
  approved: 4,
  rejected: 5,
};

interface TenantRef {
  name: string;
}

interface OnboardingRow {
  id: string;
  tenant_id: string;
  status: string;
  business_info: BusinessInfo;
  api_status: ApiStatus;
  owner_email: string | null;
  submitted_at: string | null;
  notes: string | null;
  created_at: string;
  tenants: TenantRef | TenantRef[] | null;
}

async function loadOnboardings(): Promise<OnboardingRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("onboarding")
    .select(
      "id, tenant_id, status, business_info, api_status, owner_email, submitted_at, notes, created_at, tenants(name)"
    )
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as OnboardingRow[];
}

function tenantName(row: OnboardingRow): string {
  const t = Array.isArray(row.tenants) ? row.tenants[0] : row.tenants;
  return t?.name ?? "Untitled tenant";
}

export default async function AdminOnboardingPage() {
  let rows: OnboardingRow[] = [];
  let errored = false;

  try {
    rows = await loadOnboardings();
  } catch {
    errored = true;
  }

  const sorted = [...rows].sort(
    (a, b) =>
      (STATUS_PRIORITY[a.status] ?? 9) - (STATUS_PRIORITY[b.status] ?? 9) ||
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div>
      <PageHeader
        title="Onboarding"
        description="Review client onboarding submissions and approve workspace access."
      />

      {errored ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Couldn't load onboardings"
          description="There was a problem reaching Supabase. Check the connection."
        />
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No onboardings yet"
          description="Generate a link from Clients to start one."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {sorted.map((row) => {
            const businessName = row.business_info?.business_name || tenantName(row);
            return (
              <div key={row.id} className="rounded-xl border border-border bg-elevated p-5 shadow-sm">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <h2 className="text-sm font-semibold text-foreground">{businessName}</h2>
                    <p className="text-xs text-muted-foreground">
                      {row.owner_email ?? "No owner email"} · Tenant: {tenantName(row)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={ONBOARDING_STATUS_BADGE[row.status] ?? row.status} />
                    <span className="text-xs text-muted-foreground">
                      {row.submitted_at
                        ? `Submitted ${new Date(row.submitted_at).toLocaleString()}`
                        : `Created ${new Date(row.created_at).toLocaleDateString()}`}
                    </span>
                  </div>
                </div>

                <div className="mb-3 flex flex-wrap gap-2">
                  {REQUIRED_PROVIDERS.map((provider) => {
                    const entry = row.api_status?.[provider];
                    const connected = entry?.status === "connected";
                    return (
                      <span
                        key={provider}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                          connected
                            ? "border-[var(--status-approved)]/30 text-[var(--status-approved)]"
                            : "border-border text-muted-foreground"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            connected ? "bg-[var(--status-approved)]" : "bg-muted-foreground"
                          }`}
                        />
                        {provider}
                      </span>
                    );
                  })}
                </div>

                {row.notes ? (
                  <p className="mb-3 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted-foreground">
                    Reviewer notes: {row.notes}
                  </p>
                ) : null}

                {row.status === "submitted" ? (
                  <ReviewActions onboardingId={row.id} ownerEmail={row.owner_email} />
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
