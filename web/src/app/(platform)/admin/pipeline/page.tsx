import Link from "next/link";
import { Activity, Wallet, Recycle, Gauge, ShieldCheck, AlertOctagon, Cpu } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import { stageLabel, isGatedStage, isPaidStage } from "@/lib/pipeline/stage-content";
import { cn } from "@/lib/utils";

/**
 * Pipeline Analytics Center (M12 G5 / ISS-P6-R1-12). Extends the existing M11
 * observability layer — it introduces NO new analytics storage. Everything is
 * derived from tables that already exist: pipeline_stages, jobs, api_usage,
 * prompt_cache, assets, quality_scores, compliance_checks.
 */
export const dynamic = "force-dynamic";

interface StageRow {
  stage: string;
  status: string;
  cost_usd: number | null;
  duration_ms: number | null;
  attempts: number | null;
}

function pct(n: number, d: number): string {
  if (!d) return "—";
  return `${((n / d) * 100).toFixed(0)}%`;
}

async function load() {
  const supabase = await createClient();
  const [stagesRes, usageRes, cacheRes, assetsRes, qualityRes, complianceRes] = await Promise.all([
    supabase.from("pipeline_stages").select("stage, status, cost_usd, duration_ms, attempts").limit(5000),
    supabase.from("api_usage").select("provider, cost_usd, endpoint").limit(5000),
    supabase.from("prompt_cache").select("id, kind").limit(5000),
    supabase.from("assets").select("id, reusable, phash").limit(5000),
    supabase.from("quality_scores").select("overall, passed, action, evaluator").limit(2000),
    supabase.from("compliance_checks").select("gate, status, blocking_count").limit(2000),
  ]);

  const stages = (stagesRes.data ?? []) as StageRow[];

  // Per-stage rollup (success/failure/cost/time/regeneration pressure).
  const byStage = new Map<string, { total: number; done: number; failed: number; skipped: number; cost: number; ms: number; attempts: number }>();
  for (const s of stages) {
    const e = byStage.get(s.stage) ?? { total: 0, done: 0, failed: 0, skipped: 0, cost: 0, ms: 0, attempts: 0 };
    e.total++;
    if (s.status === "done" || s.status === "approved") e.done++;
    if (s.status === "failed" || s.status === "rejected") e.failed++;
    if (s.status === "skipped") e.skipped++;
    e.cost += s.cost_usd ?? 0;
    e.ms += s.duration_ms ?? 0;
    e.attempts += s.attempts ?? 0;
    byStage.set(s.stage, e);
  }

  // Provider cost comparison (existing api_usage ledger).
  const byProvider = new Map<string, { cost: number; calls: number }>();
  for (const u of (usageRes.data ?? []) as { provider: string | null; cost_usd: number | null }[]) {
    if (!u.provider) continue;
    const e = byProvider.get(u.provider) ?? { cost: 0, calls: 0 };
    e.cost += u.cost_usd ?? 0;
    e.calls++;
    byProvider.set(u.provider, e);
  }

  // Reuse / dedupe visibility (existing asset flags + perceptual hash).
  const assets = (assetsRes.data ?? []) as { id: string; reusable: boolean | null; phash: string | null }[];
  const hashes = assets.map((a) => a.phash).filter((h): h is string => Boolean(h));
  const uniqueHashes = new Set(hashes).size;
  const duplicateAssets = hashes.length - uniqueHashes;

  const quality = (qualityRes.data ?? []) as { overall: number; passed: boolean; action: string; evaluator: string }[];
  const compliance = (complianceRes.data ?? []) as { gate: string; status: string; blocking_count: number }[];

  return {
    byStage: Array.from(byStage.entries()).sort((a, b) => b[1].total - a[1].total),
    byProvider: Array.from(byProvider.entries()).sort((a, b) => b[1].cost - a[1].cost),
    totalCost: Array.from(byProvider.values()).reduce((s, p) => s + p.cost, 0),
    cacheEntries: (cacheRes.data ?? []).length,
    reusableAssets: assets.filter((a) => a.reusable).length,
    totalAssets: assets.length,
    duplicateAssets,
    quality,
    compliance,
  };
}

export default async function AdminPipelineAnalyticsPage() {
  let data: Awaited<ReturnType<typeof load>> | null = null;
  let errored = false;
  try {
    data = await load();
  } catch {
    errored = true;
  }

  const avgQuality = data?.quality.length
    ? data.quality.reduce((s, q) => s + Number(q.overall), 0) / data.quality.length
    : null;
  const blockedCompliance = data?.compliance.filter((c) => c.status === "blocked").length ?? 0;

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="Pipeline Analytics"
          description="Per-stage success, cost, time and regeneration pressure, plus provider comparison and asset-reuse savings. Derived entirely from existing pipeline, job, usage, cache and asset data — no separate analytics store."
        />
        <Link
          href="/admin/queue/jobs"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-elevated"
        >
          <Cpu className="h-3.5 w-3.5" strokeWidth={2} />
          Durable jobs
        </Link>
      </div>

      {errored || !data ? (
        <EmptyState icon={AlertOctagon} title="Couldn't load pipeline analytics" />
      ) : (
        <div className="flex flex-col gap-8">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Metered cost" value={`$${data.totalCost.toFixed(2)}`} icon={Wallet} />
            <StatCard
              label="Avg quality"
              value={avgQuality === null ? "—" : avgQuality.toFixed(2)}
              icon={Gauge}
              error={avgQuality === null}
            />
            <StatCard label="Compliance blocks" value={blockedCompliance} icon={ShieldCheck} />
            <StatCard
              label="Reusable assets"
              value={`${data.reusableAssets}/${data.totalAssets}`}
              icon={Recycle}
            />
          </div>

          {/* Per-stage */}
          <section className="overflow-hidden rounded-xl border border-border bg-elevated">
            <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
              Stage performance
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                    <th className="px-4 py-3">Stage</th>
                    <th className="px-4 py-3">Class</th>
                    <th className="px-4 py-3 text-right">Runs</th>
                    <th className="px-4 py-3 text-right">Success</th>
                    <th className="px-4 py-3 text-right">Failed</th>
                    <th className="px-4 py-3 text-right">Skipped</th>
                    <th className="px-4 py-3 text-right">Attempts</th>
                    <th className="px-4 py-3 text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byStage.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-xs text-muted-foreground">
                        No stage executions recorded yet.
                      </td>
                    </tr>
                  ) : (
                    data.byStage.map(([stage, e]) => (
                      <tr key={stage} className="border-b border-border/60 last:border-0">
                        <td className="px-4 py-3 text-foreground">{stageLabel(stage)}</td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "text-xs font-medium",
                              isGatedStage(stage)
                                ? "text-[var(--status-paused)]"
                                : isPaidStage(stage)
                                  ? "text-primary"
                                  : "text-muted-foreground"
                            )}
                          >
                            {isGatedStage(stage) ? "gated" : isPaidStage(stage) ? "paid" : "free"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{e.total}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{pct(e.done, e.total)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-[var(--status-failed)]">{e.failed}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{e.skipped}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{e.attempts}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">${e.cost.toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Cost optimization */}
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="overflow-hidden rounded-xl border border-border bg-elevated">
              <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
                Provider comparison
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {data.byProvider.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-center text-xs text-muted-foreground">No metered provider usage yet.</td>
                    </tr>
                  ) : (
                    data.byProvider.map(([p, e]) => (
                      <tr key={p} className="border-b border-border/60 last:border-0">
                        <td className="px-4 py-2.5 text-foreground">{p}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{e.calls} calls</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">${e.cost.toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                          ${e.calls ? (e.cost / e.calls).toFixed(4) : "0.0000"}/call
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 rounded-xl border border-border bg-elevated p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Recycle className="h-4 w-4 text-primary" strokeWidth={1.75} />
                Reuse &amp; deduplication
              </h2>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Prompt-cache entries</dt>
                  <dd className="tabular-nums text-foreground">{data.cacheEntries}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Reusable assets</dt>
                  <dd className="tabular-nums text-foreground">
                    {data.reusableAssets}/{data.totalAssets}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Duplicate assets (pHash)</dt>
                  <dd className="tabular-nums text-foreground">{data.duplicateAssets}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Quality evaluations</dt>
                  <dd className="tabular-nums text-foreground">{data.quality.length}</dd>
                </div>
              </dl>
              <p className="text-xs text-muted-foreground">
                Duplicate detection uses the perceptual hashes already stored on assets; reuse avoids
                regenerating a paid asset that the workspace already owns.
              </p>
            </div>
          </section>

          {/* Gate outcomes */}
          <section className="overflow-hidden rounded-xl border border-border bg-elevated">
            <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
              Quality &amp; compliance gates
            </div>
            <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1 text-sm">
                <span className="text-xs font-medium text-muted-foreground">Quality actions</span>
                {data.quality.length === 0 ? (
                  <span className="text-xs text-muted-foreground">No evaluations yet.</span>
                ) : (
                  Object.entries(
                    data.quality.reduce<Record<string, number>>((acc, q) => {
                      acc[q.action] = (acc[q.action] ?? 0) + 1;
                      return acc;
                    }, {})
                  ).map(([action, n]) => (
                    <span key={action} className="flex justify-between text-muted-foreground">
                      <span>{action}</span>
                      <span className="tabular-nums">{n}</span>
                    </span>
                  ))
                )}
              </div>
              <div className="flex flex-col gap-1 text-sm">
                <span className="text-xs font-medium text-muted-foreground">Compliance outcomes</span>
                {data.compliance.length === 0 ? (
                  <span className="text-xs text-muted-foreground">No checks yet.</span>
                ) : (
                  Object.entries(
                    data.compliance.reduce<Record<string, number>>((acc, c) => {
                      const k = `${c.gate}:${c.status}`;
                      acc[k] = (acc[k] ?? 0) + 1;
                      return acc;
                    }, {})
                  ).map(([k, n]) => (
                    <span key={k} className="flex justify-between text-muted-foreground">
                      <span>{k}</span>
                      <span className="tabular-nums">{n}</span>
                    </span>
                  ))
                )}
              </div>
            </div>
          </section>

          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Activity className="h-3.5 w-3.5" strokeWidth={1.75} />
            Gated stages are deferred by design and produce no intelligence until their dependency is
            authorized — they are counted as skipped, never as successful output.
          </p>
        </div>
      )}
    </div>
  );
}
