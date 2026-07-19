import { ScrollText, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";

// Reads live rows from Supabase on every request — never prerender this.
export const dynamic = "force-dynamic";

interface StageLogRow {
  id: string;
  stage: string;
  status: string;
  model: string | null;
  last_error: string | null;
  updated_at: string;
}

interface JobLogRow {
  id: string;
  type: string | null;
  status: string | null;
  attempts: number;
  last_error: string | null;
  updated_at: string;
}

interface AuditLogRow {
  id: string;
  action: string;
  target: string | null;
  created_at: string;
}

interface EventLogRow {
  id: string;
  level: string | null;
  source: string | null;
  message: string | null;
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

export default async function LogsPage() {
  const supabase = await createClient();
  const tenantId = (await getCurrentTenantId()) ?? "";

  let stageLogs: StageLogRow[] = [];
  let jobLogs: JobLogRow[] = [];
  let auditLogs: AuditLogRow[] = [];
  let eventLogs: EventLogRow[] = [];
  let errored = false;

  try {
    const [
      { data: stages, error: stagesError },
      { data: jobs, error: jobsError },
      { data: audits, error: auditsError },
      { data: events, error: eventsError },
    ] = await Promise.all([
      supabase
        .from("pipeline_stages")
        .select("id, stage, status, model, last_error, updated_at")
        .eq("tenant_id", tenantId)
        .order("updated_at", { ascending: false })
        .limit(50),
      supabase
        .from("jobs")
        .select("id, type, status, attempts, last_error, updated_at")
        .order("updated_at", { ascending: false })
        .limit(50),
      supabase
        .from("audit_log")
        .select("id, action, target, created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("event_log")
        .select("id, level, source, message, created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    if (stagesError) throw stagesError;
    if (jobsError) throw jobsError;
    if (auditsError) throw auditsError;
    if (eventsError) throw eventsError;
    stageLogs = stages ?? [];
    jobLogs = jobs ?? [];
    auditLogs = audits ?? [];
    eventLogs = events ?? [];
  } catch {
    errored = true;
  }

  if (errored) {
    return (
      <div>
        <PageHeader title="Logs" description="Recent pipeline and job activity." />
        <EmptyState
          icon={ScrollText}
          title="Couldn't load logs"
          description="There was a problem reaching Supabase. Check your connection."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Logs" description="Recent pipeline and job activity." />

      <div className="rounded-xl border border-border bg-elevated">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">Pipeline stages</h2>
        </div>
        {stageLogs.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={ScrollText} title="No stage activity yet" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Stage</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Model</th>
                  <th className="px-5 py-3 font-medium">Updated</th>
                  <th className="px-5 py-3 font-medium">Last error</th>
                </tr>
              </thead>
              <tbody>
                {stageLogs.map((row) => (
                  <tr key={row.id} className="border-b border-border/60 last:border-0">
                    <td className="px-5 py-3 font-medium capitalize text-foreground">
                      {row.stage.replace(/_/g, " ")}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {row.model ?? "—"}
                    </td>
                    <td className="px-5 py-3 tabular-nums text-muted-foreground">
                      {formatTimestamp(row.updated_at)}
                    </td>
                    <td className="px-5 py-3 max-w-[260px] truncate text-[var(--status-failed)]">
                      {row.last_error ? (
                        <span className="inline-flex items-center gap-1.5">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                          <span className="truncate">{row.last_error}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-8 rounded-xl border border-border bg-elevated">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">Jobs</h2>
        </div>
        {jobLogs.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={ScrollText} title="No job activity yet" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Attempts</th>
                  <th className="px-5 py-3 font-medium">Updated</th>
                  <th className="px-5 py-3 font-medium">Last error</th>
                </tr>
              </thead>
              <tbody>
                {jobLogs.map((row) => (
                  <tr key={row.id} className="border-b border-border/60 last:border-0">
                    <td className="px-5 py-3 font-medium capitalize text-foreground">
                      {row.type ?? "—"}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={row.status ?? "pending"} />
                    </td>
                    <td className="px-5 py-3 tabular-nums text-muted-foreground">
                      {row.attempts}
                    </td>
                    <td className="px-5 py-3 tabular-nums text-muted-foreground">
                      {formatTimestamp(row.updated_at)}
                    </td>
                    <td className="px-5 py-3 max-w-[260px] truncate text-[var(--status-failed)]">
                      {row.last_error ? (
                        <span className="inline-flex items-center gap-1.5">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                          <span className="truncate">{row.last_error}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-elevated">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold text-foreground">Activity (audit log)</h2>
          </div>
          {auditLogs.length === 0 ? (
            <div className="p-5">
              <EmptyState icon={ScrollText} title="No activity recorded yet" />
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {auditLogs.map((row) => (
                <li key={row.id} className="flex flex-col gap-1 px-5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium text-foreground">
                      {row.action}
                    </span>
                    <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                      {formatTimestamp(row.created_at)}
                    </span>
                  </div>
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

        <div className="rounded-xl border border-border bg-elevated">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold text-foreground">System events</h2>
          </div>
          {eventLogs.length === 0 ? (
            <div className="p-5">
              <EmptyState icon={ScrollText} title="No system events logged yet" />
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {eventLogs.map((row) => (
                <li key={row.id} className="flex flex-col gap-1 px-5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                        LEVEL_STYLE[row.level ?? "info"] ?? LEVEL_STYLE.info
                      )}
                    >
                      {row.level ?? "info"}
                    </span>
                    <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                      {formatTimestamp(row.created_at)}
                    </span>
                  </div>
                  <span className="truncate text-xs text-foreground">
                    {row.source ? `${row.source} — ` : ""}
                    {row.message ?? "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
