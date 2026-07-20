import { Activity, AlertOctagon, Building2, ScrollText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getUserEmails } from "@/lib/admin/emails";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";

// Cross-tenant system observability — reads live on every request.
export const dynamic = "force-dynamic";

interface EventRow {
  id: string;
  tenant_id: string | null;
  level: string | null;
  source: string | null;
  message: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
}

interface AuditRow {
  id: string;
  tenant_id: string | null;
  user_id: string | null;
  action: string;
  target: string | null;
  created_at: string;
}

const LEVEL_STYLE: Record<string, string> = {
  info: "text-muted-foreground border-border bg-surface",
  warn: "text-[var(--status-paused)] border-[var(--status-paused)]/30 bg-[var(--status-paused)]/10",
  error: "text-[var(--status-failed)] border-[var(--status-failed)]/30 bg-[var(--status-failed)]/10",
};

function formatTimestamp(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

async function loadObservability() {
  const supabase = await createClient();

  const [
    eventsRes,
    errorCountRes,
    tenantsCountRes,
    activeRunsRes,
    failedStagesRes,
    auditRes,
    tenantsRes,
  ] = await Promise.all([
    supabase
      .from("event_log")
      .select("id, tenant_id, level, source, message, meta, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("event_log")
      .select("*", { count: "exact", head: true })
      .eq("level", "error"),
    supabase.from("tenants").select("*", { count: "exact", head: true }),
    supabase
      .from("pipeline_runs")
      .select("*", { count: "exact", head: true })
      .in("status", ["running", "awaiting_review", "awaiting_payment"]),
    supabase
      .from("pipeline_stages")
      .select("*", { count: "exact", head: true })
      .eq("status", "failed"),
    supabase
      .from("audit_log")
      .select("id, tenant_id, user_id, action, target, created_at")
      .order("created_at", { ascending: false })
      .limit(25),
    supabase.from("tenants").select("id, name"),
  ]);

  if (eventsRes.error) throw eventsRes.error;
  if (auditRes.error) throw auditRes.error;

  const events = (eventsRes.data ?? []) as EventRow[];
  const audits = (auditRes.data ?? []) as AuditRow[];
  const tenantNames = new Map(
    ((tenantsRes.data ?? []) as { id: string; name: string }[]).map((t) => [t.id, t.name])
  );

  const actorIds = Array.from(
    new Set(audits.map((a) => a.user_id).filter((id): id is string => Boolean(id)))
  );
  const emails = await getUserEmails(actorIds);

  return {
    events,
    audits,
    tenantNames,
    emails,
    errorCount: errorCountRes.count ?? 0,
    tenantsCount: tenantsCountRes.count ?? 0,
    activeRuns: activeRunsRes.count ?? 0,
    failedStages: failedStagesRes.count ?? 0,
  };
}

export default async function AdminObservabilityPage() {
  let data: Awaited<ReturnType<typeof loadObservability>> | null = null;
  let errored = false;

  try {
    data = await loadObservability();
  } catch {
    errored = true;
  }

  return (
    <div>
      <PageHeader
        title="Observability"
        description="System-wide event log, error tracking, and recent admin activity. External error tracking (Sentry) can be wired up later via a DSN."
      />

      {errored || !data ? (
        <EmptyState
          icon={Activity}
          title="Couldn't load observability data"
          description="There was a problem reaching Supabase. Check the connection."
        />
      ) : (
        <>
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Tenants" value={data.tenantsCount} icon={Building2} />
            <StatCard label="Active runs" value={data.activeRuns} icon={Activity} />
            <StatCard
              label="Failed stages"
              value={data.failedStages}
              icon={AlertOctagon}
              error={data.failedStages > 0}
            />
            <StatCard
              label="Errors logged"
              value={data.errorCount}
              icon={AlertOctagon}
              error={data.errorCount > 0}
            />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <div className="rounded-xl border border-border bg-elevated xl:col-span-2">
              <div className="border-b border-border px-5 py-4">
                <h2 className="text-sm font-semibold text-foreground">Event log</h2>
              </div>
              {data.events.length === 0 ? (
                <div className="p-5">
                  <EmptyState icon={ScrollText} title="No events logged yet" />
                </div>
              ) : (
                <div className="max-h-[560px] overflow-y-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-elevated">
                      <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="px-5 py-3 font-medium">Level</th>
                        <th className="px-5 py-3 font-medium">Source</th>
                        <th className="px-5 py-3 font-medium">Message</th>
                        <th className="px-5 py-3 font-medium">Tenant</th>
                        <th className="px-5 py-3 font-medium">When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.events.map((row) => (
                        <tr key={row.id} className="border-b border-border/60 last:border-0">
                          <td className="px-5 py-3">
                            <span
                              className={cn(
                                "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                                LEVEL_STYLE[row.level ?? "info"] ?? LEVEL_STYLE.info
                              )}
                            >
                              {row.level ?? "info"}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-xs font-medium text-foreground">
                            {row.source ?? "—"}
                          </td>
                          <td className="max-w-[280px] truncate px-5 py-3 text-xs text-muted-foreground">
                            {row.message ?? "—"}
                          </td>
                          <td className="px-5 py-3 text-xs text-muted-foreground">
                            {row.tenant_id ? (data.tenantNames.get(row.tenant_id) ?? "—") : "—"}
                          </td>
                          <td className="px-5 py-3 tabular-nums text-xs text-muted-foreground">
                            {formatTimestamp(row.created_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border bg-elevated">
              <div className="border-b border-border px-5 py-4">
                <h2 className="text-sm font-semibold text-foreground">Recent admin activity</h2>
              </div>
              {data.audits.length === 0 ? (
                <div className="p-5">
                  <EmptyState icon={ScrollText} title="No audit entries yet" />
                </div>
              ) : (
                <ul className="flex max-h-[560px] flex-col divide-y divide-border overflow-y-auto">
                  {data.audits.map((row) => (
                    <li key={row.id} className="flex flex-col gap-1 px-5 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-medium text-foreground">
                          {row.action}
                        </span>
                        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                          {formatTimestamp(row.created_at)}
                        </span>
                      </div>
                      <span className="truncate text-[11px] text-muted-foreground">
                        {row.user_id ? (data.emails.get(row.user_id) ?? row.user_id) : "system"}
                        {row.tenant_id ? ` · ${data.tenantNames.get(row.tenant_id) ?? row.tenant_id}` : ""}
                      </span>
                      {row.target ? (
                        <span className="truncate font-mono text-[10px] text-muted-foreground">
                          {row.target}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
