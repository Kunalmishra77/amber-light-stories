import { PieChart } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import { formatUsd } from "@/lib/cost";

// Cross-tenant usage/cost table — reads live on every request.
export const dynamic = "force-dynamic";

interface TenantRow {
  id: string;
  name: string;
}

interface TenantUsage extends TenantRow {
  stories: number;
  videos: number;
  plannedCost: number;
  apiUsageCost: number;
}

async function loadUsage(): Promise<TenantUsage[]> {
  const supabase = await createClient();

  const { data: tenants, error } = await supabase
    .from("tenants")
    .select("id, name")
    .order("name", { ascending: true });
  if (error) throw error;

  const rows = (tenants ?? []) as TenantRow[];

  return Promise.all(
    rows.map(async (tenant) => {
      const [storiesRes, videosRes, runsRes, apiUsageRes] = await Promise.all([
        supabase.from("stories").select("*", { count: "exact", head: true }).eq("tenant_id", tenant.id),
        supabase.from("videos").select("*", { count: "exact", head: true }).eq("tenant_id", tenant.id),
        supabase.from("pipeline_runs").select("budget_usd").eq("tenant_id", tenant.id),
        supabase.from("api_usage").select("cost_usd").eq("tenant_id", tenant.id),
      ]);

      const plannedCost = (runsRes.data ?? []).reduce(
        (sum, r) => sum + (Number(r.budget_usd) || 0),
        0
      );
      const apiUsageCost = (apiUsageRes.data ?? []).reduce(
        (sum, r) => sum + (Number(r.cost_usd) || 0),
        0
      );

      return {
        ...tenant,
        stories: storiesRes.count ?? 0,
        videos: videosRes.count ?? 0,
        plannedCost,
        apiUsageCost,
      };
    })
  );
}

export default async function AdminUsagePage() {
  let rows: TenantUsage[] = [];
  let errored = false;

  try {
    rows = await loadUsage();
  } catch {
    errored = true;
  }

  const totals = rows.reduce(
    (acc, r) => ({
      stories: acc.stories + r.stories,
      videos: acc.videos + r.videos,
      plannedCost: acc.plannedCost + r.plannedCost,
      apiUsageCost: acc.apiUsageCost + r.apiUsageCost,
    }),
    { stories: 0, videos: 0, plannedCost: 0, apiUsageCost: 0 }
  );

  return (
    <div>
      <PageHeader
        title="Cross-Tenant Usage"
        description="Stories, videos, and API cost per tenant, platform-wide."
      />

      {errored ? (
        <EmptyState
          icon={PieChart}
          title="Couldn't load usage"
          description="There was a problem reaching Supabase. Check the connection."
        />
      ) : (
        <>
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Stories (all tenants)" value={totals.stories} icon={PieChart} />
            <StatCard label="Videos (all tenants)" value={totals.videos} icon={PieChart} />
            <StatCard label="Planned cost" value={formatUsd(totals.plannedCost)} icon={PieChart} />
            <StatCard label="API usage cost" value={formatUsd(totals.apiUsageCost)} icon={PieChart} />
          </div>

          {rows.length === 0 ? (
            <EmptyState icon={PieChart} title="No tenants yet" description="Create a client to see usage here." />
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-elevated shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      <th className="px-5 py-3">Tenant</th>
                      <th className="px-5 py-3">Stories</th>
                      <th className="px-5 py-3">Videos</th>
                      <th className="px-5 py-3">Planned cost</th>
                      <th className="px-5 py-3">API usage cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td className="px-5 py-3 font-medium text-foreground">{r.name}</td>
                        <td className="px-5 py-3 tabular-nums text-foreground">{r.stories}</td>
                        <td className="px-5 py-3 tabular-nums text-foreground">{r.videos}</td>
                        <td className="px-5 py-3 tabular-nums text-foreground">{formatUsd(r.plannedCost)}</td>
                        <td className="px-5 py-3 tabular-nums text-foreground">{formatUsd(r.apiUsageCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
