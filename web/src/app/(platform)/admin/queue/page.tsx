import Link from "next/link";
import { ListChecks, Activity, AlertOctagon, CheckCircle2, Eye } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { stageLabel } from "@/lib/pipeline/stage-content";
import { cn } from "@/lib/utils";
import { RunActions } from "./run-actions";

// Cross-tenant job queue — reads live pipeline state on every request.
export const dynamic = "force-dynamic";

/** Filter views over the run list. */
const VIEWS = {
  all: { label: "All", statuses: null as string[] | null },
  active: { label: "Active", statuses: ["running", "paused", "awaiting_review", "awaiting_payment"] },
  dlq: { label: "Dead-letter", statuses: ["failed"] },
  done: { label: "Closed", statuses: ["done", "cancelled"] },
} as const;

type ViewKey = keyof typeof VIEWS;

interface RunRow {
  id: string;
  tenant_id: string | null;
  story_id: string | null;
  status: string;
  current_stage: string | null;
  total_cost_usd: number | null;
  budget_usd: number | null;
  started_at: string | null;
  finished_at: string | null;
}

function formatAge(value: string | null): string {
  if (!value) return "—";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "—";
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function formatUsd(value: number | null): string {
  return `$${(value ?? 0).toFixed(2)}`;
}

async function loadQueue(view: ViewKey) {
  const supabase = await createClient();

  let runsQuery = supabase
    .from("pipeline_runs")
    .select("id, tenant_id, story_id, status, current_stage, total_cost_usd, budget_usd, started_at, finished_at")
    .order("started_at", { ascending: false })
    .limit(200);

  const statuses = VIEWS[view].statuses;
  if (statuses) runsQuery = runsQuery.in("status", statuses);

  const [runsRes, activeRes, failedRes, doneRes, totalRes, tenantsRes] = await Promise.all([
    runsQuery,
    supabase.from("pipeline_runs").select("*", { count: "exact", head: true }).in("status", VIEWS.active.statuses),
    supabase.from("pipeline_runs").select("*", { count: "exact", head: true }).eq("status", "failed"),
    supabase.from("pipeline_runs").select("*", { count: "exact", head: true }).eq("status", "done"),
    supabase.from("pipeline_runs").select("*", { count: "exact", head: true }),
    supabase.from("tenants").select("id, name"),
  ]);

  if (runsRes.error) throw runsRes.error;

  const runs = (runsRes.data ?? []) as RunRow[];
  const tenantNames = new Map(
    ((tenantsRes.data ?? []) as { id: string; name: string }[]).map((t) => [t.id, t.name])
  );

  // Resolve story topics for the runs on screen (single batched query).
  const storyIds = Array.from(new Set(runs.map((r) => r.story_id).filter((id): id is string => Boolean(id))));
  const storyTopics = new Map<string, string>();
  if (storyIds.length > 0) {
    const { data: stories } = await supabase.from("stories").select("id, topic").in("id", storyIds);
    for (const s of (stories ?? []) as { id: string; topic: string | null }[]) {
      storyTopics.set(s.id, s.topic ?? "Untitled");
    }
  }

  return {
    runs,
    tenantNames,
    storyTopics,
    activeCount: activeRes.count ?? 0,
    failedCount: failedRes.count ?? 0,
    doneCount: doneRes.count ?? 0,
    totalCount: totalRes.count ?? 0,
  };
}

export default async function AdminQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view: rawView } = await searchParams;
  const view: ViewKey = rawView && rawView in VIEWS ? (rawView as ViewKey) : "all";

  let data: Awaited<ReturnType<typeof loadQueue>> | null = null;
  let errored = false;
  try {
    data = await loadQueue(view);
  } catch {
    errored = true;
  }

  return (
    <div>
      <PageHeader
        title="Job Queue"
        description="Cross-tenant pipeline runs — inspect, retry failed runs (dead-letter), or cancel in-flight ones. In dry/mock mode there is no autonomous worker; retry re-opens a run into the standard review loop."
      />

      {errored || !data ? (
        <EmptyState icon={AlertOctagon} title="Couldn't load the job queue" />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Total runs" value={data.totalCount} icon={ListChecks} />
            <StatCard label="Active" value={data.activeCount} icon={Activity} />
            <StatCard label="Dead-letter (failed)" value={data.failedCount} icon={AlertOctagon} />
            <StatCard label="Completed" value={data.doneCount} icon={CheckCircle2} />
          </div>

          {/* View filter tabs */}
          <div className="mb-4 flex flex-wrap gap-2">
            {(Object.keys(VIEWS) as ViewKey[]).map((key) => (
              <Link
                key={key}
                href={key === "all" ? "/admin/queue" : `/admin/queue?view=${key}`}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                  key === view
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-surface text-muted-foreground hover:bg-elevated hover:text-foreground"
                )}
              >
                {VIEWS[key].label}
              </Link>
            ))}
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-elevated shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                    <th className="px-4 py-3">Tenant</th>
                    <th className="px-4 py-3">Story</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Stage</th>
                    <th className="px-4 py-3 text-right">Cost / Budget</th>
                    <th className="px-4 py-3 text-right">Age</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.runs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10">
                        <EmptyState icon={ListChecks} title="No runs in this view" />
                      </td>
                    </tr>
                  ) : (
                    data.runs.map((run) => (
                      <tr key={run.id} className="border-b border-border/60 last:border-0">
                        <td className="px-4 py-3 text-foreground">
                          {run.tenant_id ? data.tenantNames.get(run.tenant_id) ?? "—" : "—"}
                        </td>
                        <td className="max-w-[220px] truncate px-4 py-3 text-muted-foreground">
                          {run.story_id ? data.storyTopics.get(run.story_id) ?? "Untitled" : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={run.status} />
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {run.current_stage ? stageLabel(run.current_stage) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                          {formatUsd(run.total_cost_usd)} / {formatUsd(run.budget_usd)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                          {formatAge(run.started_at)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col items-end gap-2">
                            <Link
                              href={`/admin/queue/${run.id}`}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-elevated"
                            >
                              <Eye className="h-3.5 w-3.5" strokeWidth={2} />
                              Inspect
                            </Link>
                            <RunActions runId={run.id} status={run.status} />
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
