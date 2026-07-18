import { Stethoscope, Info } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";

// Cross-tenant pipeline/job health — reads live on every request.
export const dynamic = "force-dynamic";

interface TenantRow {
  id: string;
  name: string;
}

interface TenantHealth extends TenantRow {
  runStatusCounts: Record<string, number>;
  failedStages: number;
  failedJobs: number;
}

async function loadHealth(): Promise<TenantHealth[]> {
  const supabase = await createClient();

  const { data: tenants, error } = await supabase
    .from("tenants")
    .select("id, name")
    .order("name", { ascending: true });
  if (error) throw error;

  const rows = (tenants ?? []) as TenantRow[];

  return Promise.all(
    rows.map(async (tenant) => {
      const [runsRes, failedStagesRes, failedJobsRes] = await Promise.all([
        supabase.from("pipeline_runs").select("status").eq("tenant_id", tenant.id),
        supabase
          .from("pipeline_stages")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenant.id)
          .eq("status", "failed"),
        supabase
          .from("jobs")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenant.id)
          .eq("status", "failed"),
      ]);

      const runStatusCounts: Record<string, number> = {};
      for (const r of runsRes.data ?? []) {
        const status = (r.status as string) ?? "unknown";
        runStatusCounts[status] = (runStatusCounts[status] ?? 0) + 1;
      }

      return {
        ...tenant,
        runStatusCounts,
        failedStages: failedStagesRes.count ?? 0,
        failedJobs: failedJobsRes.count ?? 0,
      };
    })
  );
}

export default async function AdminHealthPage() {
  let rows: TenantHealth[] = [];
  let errored = false;

  try {
    rows = await loadHealth();
  } catch {
    errored = true;
  }

  return (
    <div>
      <PageHeader
        title="Cross-Tenant Health"
        description="Pipeline run status and failure counts across every tenant."
      />

      <div className="mb-6 flex items-start gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={1.75} />
        <p className="text-sm text-foreground">
          Storage usage tracking (asset bytes per tenant) is not wired up yet — it lands with the
          credential vault in a later phase.
        </p>
      </div>

      {errored ? (
        <EmptyState
          icon={Stethoscope}
          title="Couldn't load health data"
          description="There was a problem reaching Supabase. Check the connection."
        />
      ) : rows.length === 0 ? (
        <EmptyState icon={Stethoscope} title="No tenants yet" description="Create a client to see health here." />
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map((tenant) => (
            <div
              key={tenant.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-elevated p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-foreground">{tenant.name}</h2>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className={tenant.failedStages > 0 ? "text-[var(--status-failed)]" : ""}>
                    {tenant.failedStages} failed stages
                  </span>
                  <span>·</span>
                  <span className={tenant.failedJobs > 0 ? "text-[var(--status-failed)]" : ""}>
                    {tenant.failedJobs} failed jobs
                  </span>
                </div>
              </div>
              {Object.keys(tenant.runStatusCounts).length === 0 ? (
                <p className="text-xs text-muted-foreground">No pipeline runs yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(tenant.runStatusCounts).map(([status, count]) => (
                    <span
                      key={status}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1"
                    >
                      <StatusBadge status={status} />
                      <span className="text-xs font-medium tabular-nums text-foreground">{count}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
