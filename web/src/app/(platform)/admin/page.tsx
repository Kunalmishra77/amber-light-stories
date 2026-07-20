import {
  Building2,
  BookOpen,
  Clapperboard,
  DollarSign,
  AlertTriangle,
  Wrench,
  History,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import { formatUsd } from "@/lib/cost";
import { getPlatformSettings } from "@/lib/branding";

// Cross-tenant KPIs read live on every request — never prerender.
export const dynamic = "force-dynamic";

interface Kpis {
  totalTenants: number;
  activeTenants: number;
  suspendedTenants: number;
  lockedTenants: number;
  totalStories: number;
  totalVideos: number;
  plannedCostUsd: number;
  failedStages: number;
}

interface MaintenanceRow {
  enabled: boolean;
  message: string | null;
}

interface AuditRow {
  id: string;
  action: string;
  target: string | null;
  created_at: string;
  actor: string | null;
}

async function loadOverview() {
  const supabase = await createClient();

  const [
    tenantsCount,
    activeCount,
    suspendedCount,
    lockedCount,
    storiesCount,
    videosCount,
    runsBudget,
    failedStagesCount,
    maintenanceRow,
    auditRows,
  ] = await Promise.all([
    supabase.from("tenants").select("*", { count: "exact", head: true }),
    supabase
      .from("tenants")
      .select("*", { count: "exact", head: true })
      .eq("status", "active"),
    supabase
      .from("tenants")
      .select("*", { count: "exact", head: true })
      .eq("status", "suspended"),
    supabase
      .from("tenants")
      .select("*", { count: "exact", head: true })
      .eq("status", "locked"),
    supabase.from("stories").select("*", { count: "exact", head: true }),
    supabase.from("videos").select("*", { count: "exact", head: true }),
    supabase.from("pipeline_runs").select("budget_usd"),
    supabase
      .from("pipeline_stages")
      .select("*", { count: "exact", head: true })
      .eq("status", "failed"),
    supabase
      .from("maintenance")
      .select("enabled, message")
      .eq("id", 1)
      .maybeSingle<MaintenanceRow>(),
    supabase
      .from("audit_log")
      .select("id, action, target, created_at, user_id")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const plannedCostUsd = (runsBudget.data ?? []).reduce(
    (sum, row) => sum + (Number(row.budget_usd) || 0),
    0
  );

  const kpis: Kpis = {
    totalTenants: tenantsCount.count ?? 0,
    activeTenants: activeCount.count ?? 0,
    suspendedTenants: suspendedCount.count ?? 0,
    lockedTenants: lockedCount.count ?? 0,
    totalStories: storiesCount.count ?? 0,
    totalVideos: videosCount.count ?? 0,
    plannedCostUsd,
    failedStages: failedStagesCount.count ?? 0,
  };

  const rawAudit = auditRows.data ?? [];
  const actorIds = Array.from(
    new Set(rawAudit.map((r) => r.user_id).filter(Boolean) as string[])
  );
  const profileMap = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name")
      .in("user_id", actorIds);
    for (const p of profiles ?? []) {
      profileMap.set(p.user_id as string, (p.full_name as string) || "Unknown");
    }
  }

  const activity: AuditRow[] = rawAudit.map((r) => ({
    id: r.id as string,
    action: r.action as string,
    target: r.target as string | null,
    created_at: r.created_at as string,
    actor: r.user_id ? profileMap.get(r.user_id as string) ?? "Unknown" : null,
  }));

  return {
    kpis,
    maintenance: maintenanceRow.data ?? { enabled: false, message: null },
    activity,
  };
}

export default async function AdminOverviewPage() {
  let data: Awaited<ReturnType<typeof loadOverview>> | null = null;
  let errored = false;

  try {
    data = await loadOverview();
  } catch {
    errored = true;
  }

  // PLATFORM brand — this is a platform-level page; it must never show a
  // client's brand (Bible Part 2 / ADR-001).
  const platform = await getPlatformSettings();

  return (
    <div>
      <PageHeader
        title="Platform Admin"
        description={`Cross-tenant administration for ${platform.platform_name}.`}
      />

      {errored || !data ? (
        <EmptyState
          icon={Building2}
          title="Couldn't load platform overview"
          description="There was a problem reaching Supabase. Check the connection."
        />
      ) : (
        <>
          {data.maintenance.enabled ? (
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-[var(--status-failed)]/30 bg-[var(--status-failed)]/10 px-4 py-3">
              <Wrench
                className="mt-0.5 h-4 w-4 shrink-0 text-[var(--status-failed)]"
                strokeWidth={1.75}
              />
              <p className="text-sm text-foreground">
                Maintenance mode is <strong>ON</strong>
                {data.maintenance.message ? ` — "${data.maintenance.message}"` : ""}
              </p>
            </div>
          ) : null}

          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total clients" value={data.kpis.totalTenants} icon={Building2} />
            <StatCard label="Active" value={data.kpis.activeTenants} icon={Building2} />
            <StatCard label="Suspended" value={data.kpis.suspendedTenants} icon={AlertTriangle} />
            <StatCard label="Locked" value={data.kpis.lockedTenants} icon={AlertTriangle} />
            <StatCard label="Total stories" value={data.kpis.totalStories} icon={BookOpen} />
            <StatCard label="Total videos" value={data.kpis.totalVideos} icon={Clapperboard} />
            <StatCard
              label="Planned AI cost"
              value={formatUsd(data.kpis.plannedCostUsd)}
              icon={DollarSign}
            />
            <StatCard
              label="Failed pipeline stages"
              value={data.kpis.failedStages}
              icon={AlertTriangle}
              error={data.kpis.failedStages > 0}
            />
          </div>

          <div className="rounded-xl border border-border bg-elevated shadow-sm">
            <div className="flex items-center gap-2 border-b border-border px-5 py-4">
              <History className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
              <h2 className="text-sm font-semibold text-foreground">Recent admin activity</h2>
            </div>
            {data.activity.length === 0 ? (
              <div className="px-5 py-10">
                <EmptyState
                  icon={History}
                  title="No activity yet"
                  description="Admin actions (client status changes, flag toggles, etc.) will show up here."
                />
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {data.activity.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-col gap-1 px-5 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="text-foreground">
                      <span className="font-medium">{row.actor ?? "System"}</span>{" "}
                      <span className="text-muted-foreground">{row.action}</span>{" "}
                      {row.target ? (
                        <span className="font-mono text-xs text-muted-foreground">
                          {row.target}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {new Date(row.created_at).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
