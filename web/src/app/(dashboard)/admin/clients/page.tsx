import Link from "next/link";
import { Building2, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { StatusBadge, type PipelineStatus } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { CreateClientForm } from "./create-client-form";
import { TenantStatusActions } from "./tenant-status-actions";
import { OnboardingLinkCell } from "./onboarding-link-cell";

// Cross-tenant client list — reads live on every request.
export const dynamic = "force-dynamic";

interface TenantRow {
  id: string;
  name: string;
  slug: string | null;
  status: string;
  created_at: string;
}

const TENANT_STATUS_BADGE: Record<string, PipelineStatus> = {
  active: "approved",
  pending: "pending",
  suspended: "paused",
  locked: "failed",
  deleted: "rejected",
};

interface OnboardingSummary {
  status: string;
  link_token: string;
}

async function loadClients() {
  const supabase = await createClient();

  const [tenantsRes, membershipsRes, onboardingRes] = await Promise.all([
    supabase
      .from("tenants")
      .select("id, name, slug, status, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("memberships").select("tenant_id").eq("status", "active"),
    supabase.from("onboarding").select("tenant_id, status, link_token"),
  ]);

  if (tenantsRes.error) throw tenantsRes.error;

  const memberCounts = new Map<string, number>();
  for (const row of membershipsRes.data ?? []) {
    const tid = row.tenant_id as string;
    memberCounts.set(tid, (memberCounts.get(tid) ?? 0) + 1);
  }

  const onboardingByTenant = new Map<string, OnboardingSummary>();
  for (const row of onboardingRes.data ?? []) {
    onboardingByTenant.set(row.tenant_id as string, {
      status: row.status as string,
      link_token: row.link_token as string,
    });
  }

  return {
    tenants: (tenantsRes.data ?? []) as TenantRow[],
    memberCounts,
    onboardingByTenant,
  };
}

export default async function AdminClientsPage() {
  let data: Awaited<ReturnType<typeof loadClients>> | null = null;
  let errored = false;

  try {
    data = await loadClients();
  } catch {
    errored = true;
  }

  return (
    <div>
      <PageHeader
        title="Clients"
        description="Every tenant on the platform — onboard new clients and manage their lifecycle status."
      />

      <div className="mb-8">
        <CreateClientForm />
      </div>

      {errored || !data ? (
        <EmptyState
          icon={Building2}
          title="Couldn't load clients"
          description="There was a problem reaching Supabase. Check the connection."
        />
      ) : data.tenants.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No clients yet"
          description="Create your first client above."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-elevated shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Slug</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Members</th>
                  <th className="px-5 py-3">Onboarding</th>
                  <th className="px-5 py-3">Created</th>
                  <th className="px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.tenants.map((tenant) => (
                  <tr key={tenant.id} className="align-top">
                    <td className="px-5 py-3">
                      <Link
                        href={`/admin/clients/${tenant.id}`}
                        className="font-medium text-foreground hover:text-primary"
                      >
                        {tenant.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-muted-foreground">
                      {tenant.slug ?? "—"}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={TENANT_STATUS_BADGE[tenant.status] ?? tenant.status} />
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <Users className="h-3.5 w-3.5" strokeWidth={1.75} />
                        {data!.memberCounts.get(tenant.id) ?? 0}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {data!.onboardingByTenant.get(tenant.id) ? (
                        <OnboardingLinkCell
                          token={data!.onboardingByTenant.get(tenant.id)!.link_token}
                          status={data!.onboardingByTenant.get(tenant.id)!.status}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-xs text-muted-foreground">
                      {new Date(tenant.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3">
                      <TenantStatusActions
                        tenantId={tenant.id}
                        status={tenant.status}
                        compact
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
