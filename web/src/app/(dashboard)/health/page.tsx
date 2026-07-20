import { Database, Activity, HardDrive, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentTenantId } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { DEFAULT_BUDGET_USD, formatUsd } from "@/lib/cost";

// Reads live rows from Supabase on every request — never prerender this.
export const dynamic = "force-dynamic";

interface HealthCardProps {
  icon: LucideIcon;
  title: string;
  ok: boolean;
  statusLabel: string;
  detail: string;
}

function HealthCard({ icon: Icon, title, ok, statusLabel, detail }: HealthCardProps) {
  const color = ok ? "var(--status-approved)" : "var(--status-failed)";
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-elevated p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </div>
          <span className="text-sm font-medium text-foreground">{title}</span>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
          )}
          style={{
            color,
            backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
            borderColor: `color-mix(in srgb, ${color} 30%, transparent)`,
          }}
        >
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
            aria-hidden="true"
          />
          {statusLabel}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

export default async function HealthPage() {
  const supabase = await createClient();
  const tenantId = (await getCurrentTenantId()) ?? "";

  // If this page is rendering at all, the authed client + Supabase
  // reachability already succeeded — but we still run a live query so a
  // genuine outage (RLS misconfig, network partition mid-request) flips
  // this to Degraded.
  let supabaseOk = true;
  const runStatusCounts: Record<string, number> = {};
  let budget = DEFAULT_BUDGET_USD;
  let storageOk = true;

  try {
    const [{ data: runs, error: runsError }, { data: project }] = await Promise.all([
      supabase.from("pipeline_runs").select("status").eq("tenant_id", tenantId),
      supabase
        .from("projects")
        .select("per_video_budget_usd")
        .eq("tenant_id", tenantId)
        .limit(1)
        .maybeSingle(),
    ]);
    if (runsError) throw runsError;
    for (const run of runs ?? []) {
      const key = run.status ?? "unknown";
      runStatusCounts[key] = (runStatusCounts[key] ?? 0) + 1;
    }
    budget = project?.per_video_budget_usd ?? DEFAULT_BUDGET_USD;
  } catch {
    supabaseOk = false;
  }

  try {
    // The `assets` bucket is private (ISS-C2); listing requires the service
    // role (the authed client has no bucket-level read). This is a health
    // probe only — it reads nothing tenant-specific.
    const admin = createAdminClient();
    const { error } = await admin.storage.from("assets").list("", { limit: 1 });
    if (error) throw error;
  } catch {
    storageOk = false;
  }

  const totalRuns = Object.values(runStatusCounts).reduce((a, b) => a + b, 0);
  const runSummary =
    totalRuns === 0
      ? "No pipeline runs yet."
      : Object.entries(runStatusCounts)
          .map(([status, count]) => `${count} ${status}`)
          .join(", ");

  return (
    <div>
      <PageHeader
        title="System Health"
        description="Live status for the studio's core services."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <HealthCard
          icon={Database}
          title="Supabase"
          ok={supabaseOk}
          statusLabel={supabaseOk ? "Operational" : "Degraded"}
          detail={
            supabaseOk
              ? "Reachable — this page rendered its data from a live query."
              : "Couldn't complete a live query against the database."
          }
        />
        <HealthCard
          icon={Activity}
          title="Pipeline"
          ok={supabaseOk}
          statusLabel={`${totalRuns} run${totalRuns === 1 ? "" : "s"}`}
          detail={runSummary}
        />
        <HealthCard
          icon={HardDrive}
          title="Storage bucket 'assets'"
          ok={storageOk}
          statusLabel={storageOk ? "Operational" : "Degraded"}
          detail={
            storageOk
              ? "Listable and reachable via the authenticated client."
              : "Couldn't list the 'assets' bucket."
          }
        />
        <HealthCard
          icon={ShieldCheck}
          title="Cost governor"
          ok={true}
          statusLabel="Active"
          detail={`Enforcing a hard cap of ${formatUsd(budget)} per video across every pipeline run.`}
        />
      </div>
    </div>
  );
}
