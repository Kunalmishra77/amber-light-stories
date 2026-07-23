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

interface StageRollup {
  stage: string;
  total: number;
  done: number;
  failed: number;
  skipped: number;
  cost_usd: number;
  duration_ms: number;
  attempts: number;
}

interface ProviderRollup {
  provider: string;
  cost_usd: number;
  calls: number;
}

type PlatformTotals = Record<string, number | null | undefined>;

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

/**
 * Aggregated IN THE DATABASE (migration 039).
 *
 * This used to pull ~33,000 rows into Node and reduce them in JS, with a 5,000
 * row cap per table. Past that cap the figures silently stopped being totals —
 * a wrong number nobody notices is worse than a slow page. These rollups are
 * exact at any size and cost a handful of round trips.
 */
async function load() {
  const supabase = await createClient();
  const [stageRes, providerRes, totalsRes] = await Promise.all([
    supabase.rpc("admin_stage_rollup"),
    supabase.rpc("admin_provider_rollup"),
    supabase.rpc("admin_platform_totals"),
  ]);

  const stageRows = (stageRes.data ?? []) as StageRollup[];
  const providerRows = (providerRes.data ?? []) as ProviderRollup[];
  const t = (totalsRes.data ?? {}) as PlatformTotals;
  const num = (v: unknown) => Number(v ?? 0);

  return {
    byStage: stageRows.map((r) => [
      r.stage,
      {
        total: num(r.total),
        done: num(r.done),
        failed: num(r.failed),
        skipped: num(r.skipped),
        cost: num(r.cost_usd),
        ms: num(r.duration_ms),
        attempts: num(r.attempts),
      },
    ]) as [string, { total: number; done: number; failed: number; skipped: number; cost: number; ms: number; attempts: number }][],
    byProvider: providerRows.map((r) => [
      r.provider,
      { cost: num(r.cost_usd), calls: num(r.calls) },
    ]) as [string, { cost: number; calls: number }][],
    totalCost: providerRows.reduce((sum, r) => sum + num(r.cost_usd), 0),
    cacheEntries: num(t.cache_entries),
    reusableAssets: num(t.assets_reusable),
    totalAssets: num(t.assets_total),
    duplicateAssets: num(t.assets_duplicate),
    qualityAvg: t.quality_avg === null || t.quality_avg === undefined ? null : Number(t.quality_avg),
    qualityCount: num(t.quality_count),
    qualityManual: num(t.quality_manual),
    qualityBlocked: num(t.quality_blocked),
    complianceBlocked: num(t.compliance_blocked),
    complianceReview: num(t.compliance_review),
    complianceTotal: num(t.compliance_total),
    decisions: {
      total: num(t.decisions_total),
      approved: num(t.decisions_approved),
      manualReview: num(t.decisions_review),
      blocked: num(t.decisions_blocked),
      rejected: num(t.decisions_rejected),
      byAutomation: num(t.decisions_auto),
    },
    incidents: {
      open: num(t.incidents_open),
      breached: num(t.incidents_breached),
      operational: num(t.incidents_ops),
      security: num(t.incidents_security),
    },
    review: {
      backlog: num(t.review_backlog),
      unassigned: num(t.review_unassigned),
      medianAgeHours: null as number | null,
      oldestAgeHours: t.review_oldest_hours === null || t.review_oldest_hours === undefined
        ? null
        : Number(t.review_oldest_hours),
    },
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

  const avgQuality = data?.qualityAvg ?? null;
  const blockedCompliance = data?.complianceBlocked ?? 0;

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

          {/* Human review & operations (M15 O6) — same derived-only rule. */}
          <section>
            <h2 className="mb-3 text-sm font-semibold text-foreground">
              Human review &amp; operations
            </h2>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="Review backlog" value={data.review.backlog} icon={Activity} />
              <StatCard
                label="Median wait"
                value={
                  data.review.medianAgeHours === null
                    ? "—"
                    : `${data.review.medianAgeHours.toFixed(0)}h`
                }
                icon={Gauge}
                error={data.review.medianAgeHours === null}
              />
              <StatCard label="Open incidents" value={data.incidents.open} icon={AlertOctagon} />
              <StatCard
                label="Decisions blocked"
                value={data.decisions.blocked}
                icon={ShieldCheck}
              />
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-border bg-elevated p-4">
                <p className="mb-2 text-xs font-medium text-foreground">Approval decisions</p>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <dt>Approved</dt>
                  <dd className="text-right tabular-nums text-foreground">
                    {data.decisions.approved}
                  </dd>
                  <dt>Sent to a human</dt>
                  <dd className="text-right tabular-nums text-foreground">
                    {data.decisions.manualReview}
                  </dd>
                  <dt>Blocked by safety checks</dt>
                  <dd className="text-right tabular-nums text-foreground">
                    {data.decisions.blocked}
                  </dd>
                  <dt>Rejected by a reviewer</dt>
                  <dd className="text-right tabular-nums text-foreground">
                    {data.decisions.rejected}
                  </dd>
                  <dt>Made by automation</dt>
                  <dd className="text-right tabular-nums text-foreground">
                    {data.decisions.byAutomation}
                  </dd>
                </dl>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Every row above is an append-only record with the evidence it was based on.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-elevated p-4">
                <p className="mb-2 text-xs font-medium text-foreground">Incidents &amp; queue</p>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <dt>Operational incidents</dt>
                  <dd className="text-right tabular-nums text-foreground">
                    {data.incidents.operational}
                  </dd>
                  <dt>Security incidents</dt>
                  <dd className="text-right tabular-nums text-foreground">
                    {data.incidents.security}
                  </dd>
                  <dt>Open past their SLA</dt>
                  <dd className="text-right tabular-nums text-foreground">
                    {data.incidents.breached}
                  </dd>
                  <dt>Unassigned reviews</dt>
                  <dd className="text-right tabular-nums text-foreground">
                    {data.review.unassigned}
                  </dd>
                  <dt>Oldest item waiting</dt>
                  <dd className="text-right tabular-nums text-foreground">
                    {data.review.oldestAgeHours === null
                      ? "—"
                      : `${data.review.oldestAgeHours.toFixed(0)}h`}
                  </dd>
                </dl>
              </div>
            </div>
          </section>

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
                  <dd className="tabular-nums text-foreground">{data.qualityCount}</dd>
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
                {data.qualityCount === 0 ? (
                  <span className="text-xs text-muted-foreground">No evaluations yet.</span>
                ) : (
                  [
                    ["manual review", data.qualityManual],
                    ["blocked", data.qualityBlocked],
                    ["accepted", Math.max(0, data.qualityCount - data.qualityManual - data.qualityBlocked)],
                  ].map(([action, n]) => (
                    <span key={String(action)} className="flex justify-between text-muted-foreground">
                      <span>{action}</span>
                      <span className="tabular-nums">{n}</span>
                    </span>
                  ))
                )}
              </div>
              <div className="flex flex-col gap-1 text-sm">
                <span className="text-xs font-medium text-muted-foreground">Compliance outcomes</span>
                {data.complianceTotal === 0 ? (
                  <span className="text-xs text-muted-foreground">No checks yet.</span>
                ) : (
                  [
                    ["blocked", data.complianceBlocked],
                    ["manual review", data.complianceReview],
                    ["passed", Math.max(0, data.complianceTotal - data.complianceBlocked - data.complianceReview)],
                  ].map(([k, n]) => (
                    <span key={String(k)} className="flex justify-between text-muted-foreground">
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
