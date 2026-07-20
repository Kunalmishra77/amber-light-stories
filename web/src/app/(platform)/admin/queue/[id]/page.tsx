import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { stageLabel } from "@/lib/pipeline/stage-content";
import { RunActions } from "../run-actions";

// Live run inspection — never prerender.
export const dynamic = "force-dynamic";

interface StageRow {
  id: string;
  stage: string;
  seq: number;
  status: string;
  model: string | null;
  cost_usd: number | null;
  tokens_used: number | null;
  duration_ms: number | null;
  attempts: number | null;
  last_error: string | null;
  updated_at: string | null;
}

function formatTs(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatUsd(value: number | null): string {
  return `$${(value ?? 0).toFixed(2)}`;
}

export default async function AdminRunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: run } = await supabase
    .from("pipeline_runs")
    .select("id, tenant_id, story_id, status, current_stage, total_cost_usd, budget_usd, started_at, finished_at")
    .eq("id", id)
    .maybeSingle();

  if (!run) notFound();

  const [stagesRes, tenantRes, storyRes] = await Promise.all([
    supabase
      .from("pipeline_stages")
      .select("id, stage, seq, status, model, cost_usd, tokens_used, duration_ms, attempts, last_error, updated_at")
      .eq("run_id", id)
      .order("seq", { ascending: true }),
    run.tenant_id
      ? supabase.from("tenants").select("name").eq("id", run.tenant_id).maybeSingle()
      : Promise.resolve({ data: null }),
    run.story_id
      ? supabase.from("stories").select("topic").eq("id", run.story_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const stages = (stagesRes.data ?? []) as StageRow[];
  const tenantName = (tenantRes.data as { name: string } | null)?.name ?? "—";
  const storyTopic = (storyRes.data as { topic: string | null } | null)?.topic ?? "—";

  const meta: { label: string; value: string }[] = [
    { label: "Tenant", value: tenantName },
    { label: "Story", value: storyTopic },
    { label: "Current stage", value: run.current_stage ? stageLabel(run.current_stage) : "—" },
    { label: "Cost / Budget", value: `${formatUsd(run.total_cost_usd)} / ${formatUsd(run.budget_usd)}` },
    { label: "Started", value: formatTs(run.started_at) },
    { label: "Finished", value: formatTs(run.finished_at) },
  ];

  return (
    <div>
      <Link
        href="/admin/queue"
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
        Back to Job Queue
      </Link>

      <PageHeader title="Run detail" description={`Pipeline run ${run.id}`} />

      <div className="mb-6 flex flex-col gap-4 rounded-xl border border-border bg-elevated p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <StatusBadge status={run.status} />
          <RunActions runId={run.id} status={run.status} />
        </div>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {meta.map((m) => (
            <div key={m.label} className="flex flex-col gap-0.5">
              <dt className="text-xs font-medium text-muted-foreground">{m.label}</dt>
              <dd className="truncate text-sm text-foreground">{m.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-elevated shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Model</th>
                <th className="px-4 py-3 text-right">Cost</th>
                <th className="px-4 py-3 text-right">Attempts</th>
                <th className="px-4 py-3">Last error</th>
                <th className="px-4 py-3 text-right">Updated</th>
              </tr>
            </thead>
            <tbody>
              {stages.map((s) => (
                <tr key={s.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">{s.seq}</td>
                  <td className="px-4 py-3 text-foreground">{stageLabel(s.stage)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{s.model ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{formatUsd(s.cost_usd)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{s.attempts ?? 0}</td>
                  <td className="max-w-[240px] truncate px-4 py-3 text-[var(--status-failed)]">
                    {s.last_error ?? ""}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{formatTs(s.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
