import { ScrollText, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";

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
  let errored = false;

  try {
    const [{ data: stages, error: stagesError }, { data: jobs, error: jobsError }] =
      await Promise.all([
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
      ]);
    if (stagesError) throw stagesError;
    if (jobsError) throw jobsError;
    stageLogs = stages ?? [];
    jobLogs = jobs ?? [];
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
    </div>
  );
}
