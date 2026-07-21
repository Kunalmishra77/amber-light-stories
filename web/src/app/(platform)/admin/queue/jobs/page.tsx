import Link from "next/link";
import { ArrowLeft, ListChecks, Activity, AlertOctagon, Cpu, Timer } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import { JobActions } from "./job-actions";

// Live durable-engine state — never prerender.
export const dynamic = "force-dynamic";

const VIEWS = {
  all: { label: "All", statuses: null as string[] | null },
  queued: { label: "Queued", statuses: ["queued"] },
  running: { label: "Running", statuses: ["running"] },
  dead: { label: "Dead-letter", statuses: ["dead"] },
  succeeded: { label: "Succeeded", statuses: ["succeeded"] },
} as const;
type ViewKey = keyof typeof VIEWS;

interface JobRow {
  id: string;
  tenant_id: string | null;
  type: string;
  status: string;
  priority: number;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  run_after: string | null;
  locked_by: string | null;
  lease_expires_at: string | null;
  workflow_run_id: string | null;
  created_at: string | null;
}

function fmt(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

async function load(view: ViewKey) {
  const supabase = await createClient();
  let q = supabase
    .from("jobs")
    .select(
      "id, tenant_id, type, status, priority, attempts, max_attempts, last_error, run_after, locked_by, lease_expires_at, workflow_run_id, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(200);
  const statuses = VIEWS[view].statuses;
  if (statuses) q = q.in("status", statuses);

  const [jobsRes, queuedRes, runningRes, deadRes, tenantsRes] = await Promise.all([
    q,
    supabase.from("jobs").select("*", { count: "exact", head: true }).eq("status", "queued"),
    supabase.from("jobs").select("*", { count: "exact", head: true }).eq("status", "running"),
    supabase.from("jobs").select("*", { count: "exact", head: true }).eq("status", "dead"),
    supabase.from("tenants").select("id, name"),
  ]);
  if (jobsRes.error) throw jobsRes.error;

  const jobs = (jobsRes.data ?? []) as JobRow[];
  const tenantNames = new Map(
    ((tenantsRes.data ?? []) as { id: string; name: string }[]).map((t) => [t.id, t.name])
  );
  // Worker health: distinct holders of an unexpired lease.
  const now = Date.now();
  const activeWorkers = new Set(
    jobs
      .filter((j) => j.status === "running" && j.locked_by && j.lease_expires_at && Date.parse(j.lease_expires_at) > now)
      .map((j) => j.locked_by as string)
  );

  return {
    jobs,
    tenantNames,
    queued: queuedRes.count ?? 0,
    running: runningRes.count ?? 0,
    dead: deadRes.count ?? 0,
    workers: activeWorkers.size,
  };
}

export default async function AdminJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view: raw } = await searchParams;
  const view: ViewKey = raw && raw in VIEWS ? (raw as ViewKey) : "all";

  let data: Awaited<ReturnType<typeof load>> | null = null;
  let errored = false;
  try {
    data = await load(view);
  } catch {
    errored = true;
  }

  return (
    <div>
      <Link
        href="/admin/queue"
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
        Back to Job Queue
      </Link>

      <PageHeader
        title="Durable Jobs"
        description="The Automation Engine's real job queue: leases, retries, dead-letters and workflow links. Re-drive returns dead work to the queue; every mutation is super-admin only and audited."
      />

      {errored || !data ? (
        <EmptyState icon={AlertOctagon} title="Couldn't load the job engine state" />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Queue depth" value={data.queued} icon={ListChecks} />
            <StatCard label="Running" value={data.running} icon={Activity} />
            <StatCard label="Dead-letter" value={data.dead} icon={AlertOctagon} />
            <StatCard label="Active workers" value={data.workers} icon={Cpu} />
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            {(Object.keys(VIEWS) as ViewKey[]).map((k) => (
              <Link
                key={k}
                href={k === "all" ? "/admin/queue/jobs" : `/admin/queue/jobs?view=${k}`}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                  k === view
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-surface text-muted-foreground hover:bg-elevated hover:text-foreground"
                )}
              >
                {VIEWS[k].label}
              </Link>
            ))}
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-elevated shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Tenant</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Attempts</th>
                    <th className="px-4 py-3 text-right">Prio</th>
                    <th className="px-4 py-3">Lease</th>
                    <th className="px-4 py-3">Workflow</th>
                    <th className="px-4 py-3">Last error</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.jobs.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-10">
                        <EmptyState icon={ListChecks} title="No jobs in this view" />
                      </td>
                    </tr>
                  ) : (
                    data.jobs.map((j) => {
                      const leaseLive = j.lease_expires_at && Date.parse(j.lease_expires_at) > Date.now();
                      return (
                        <tr key={j.id} className="border-b border-border/60 last:border-0">
                          <td className="px-4 py-3 font-mono text-xs text-foreground">{j.type}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {j.tenant_id ? data.tenantNames.get(j.tenant_id) ?? "—" : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={j.status === "succeeded" ? "done" : j.status} />
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                            {j.attempts}/{j.max_attempts}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{j.priority}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {j.locked_by ? (
                              <span className="inline-flex items-center gap-1">
                                <Timer className={cn("h-3 w-3", leaseLive ? "text-[var(--status-running)]" : "text-[var(--status-failed)]")} />
                                {j.locked_by}
                                {!leaseLive ? " (expired)" : ""}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                            {j.workflow_run_id ? j.workflow_run_id.slice(0, 8) : "—"}
                          </td>
                          <td className="max-w-[220px] truncate px-4 py-3 text-xs text-[var(--status-failed)]">
                            {j.last_error ?? ""}
                          </td>
                          <td className="px-4 py-3">
                            <JobActions jobId={j.id} status={j.status} />
                          </td>
                        </tr>
                      );
                    })
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
