import {
  Wallet,
  Coins,
  Recycle,
  TrendingDown,
  Sparkles,
  Clapperboard,
  Cpu,
  HardDrive,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import { rollupUsage } from "@/lib/ops/usage";
import {
  DEFAULT_BUDGET_USD,
  formatUsd,
  naiveSceneCost,
  normalizeImportance,
  sceneCost,
  type SceneForCost,
} from "@/lib/cost";

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 MB";
  const mb = bytes / 1_000_000;
  if (mb < 1000) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1000).toFixed(2)} GB`;
}

// Reads live rows from Supabase on every request — never prerender this.
export const dynamic = "force-dynamic";

interface SceneRow extends SceneForCost {
  id: string;
  story_id: string | null;
}

interface StoryRow {
  id: string;
  topic: string | null;
  project_id: string | null;
}

interface ProjectRow {
  id: string;
  per_video_budget_usd: number | null;
}

interface ApiUsageRow {
  id: string;
  provider: string | null;
  endpoint: string | null;
  units: number | null;
  cost_usd: number | null;
  created_at: string | null;
}

const IMPORTANCE_TIERS = ["HIGH", "MEDIUM", "LOW"] as const;

const TIER_STYLE: Record<
  (typeof IMPORTANCE_TIERS)[number],
  { color: string; note: string }
> = {
  HIGH: { color: "var(--status-failed)", note: "Animated — motion + image" },
  MEDIUM: { color: "var(--status-running)", note: "Fresh image, no motion" },
  LOW: { color: "var(--status-approved)", note: "Reused — $0" },
};

export default async function UsagePage() {
  const supabase = await createClient();
  const tenantId = (await getCurrentTenantId()) ?? "";

  let scenes: SceneRow[] = [];
  let stories: StoryRow[] = [];
  let projects: ProjectRow[] = [];
  let apiUsage: ApiUsageRow[] = [];
  let errored = false;

  try {
    const [scenesRes, storiesRes, projectsRes, usageRes] = await Promise.all([
      supabase
        .from("scenes")
        .select("id, story_id, importance, motion_type, recommended_quality, animate")
        .eq("tenant_id", tenantId),
      supabase.from("stories").select("id, topic, project_id").eq("tenant_id", tenantId),
      supabase
        .from("projects")
        .select("id, per_video_budget_usd")
        .eq("tenant_id", tenantId),
      supabase
        .from("api_usage")
        .select("id, provider, endpoint, units, cost_usd, created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    if (scenesRes.error) throw scenesRes.error;
    if (storiesRes.error) throw storiesRes.error;
    if (projectsRes.error) throw projectsRes.error;
    if (usageRes.error) throw usageRes.error;
    scenes = scenesRes.data ?? [];
    stories = storiesRes.data ?? [];
    projects = projectsRes.data ?? [];
    apiUsage = usageRes.data ?? [];
  } catch {
    errored = true;
  }

  const usageCounters = await rollupUsage(tenantId);

  const defaultBudget = projects[0]?.per_video_budget_usd ?? DEFAULT_BUDGET_USD;
  const budgetByProject = new Map(
    projects.map((p) => [p.id, p.per_video_budget_usd ?? DEFAULT_BUDGET_USD])
  );

  const scenesByStory = new Map<string, SceneRow[]>();
  for (const scene of scenes) {
    if (!scene.story_id) continue;
    const list = scenesByStory.get(scene.story_id) ?? [];
    list.push(scene);
    scenesByStory.set(scene.story_id, list);
  }

  const storyPlans = stories.map((story) => {
    const storyScenes = scenesByStory.get(story.id) ?? [];
    const planned = storyScenes.reduce((sum, s) => sum + sceneCost(s), 0);
    const budget =
      (story.project_id ? budgetByProject.get(story.project_id) : undefined) ??
      defaultBudget;
    return { story, sceneCount: storyScenes.length, planned, budget };
  });

  const totalPlanned = storyPlans.reduce((sum, p) => sum + p.planned, 0);
  const avgPerVideo = storyPlans.length > 0 ? totalPlanned / storyPlans.length : 0;

  const totalScenes = scenes.length;
  const animatedScenes = scenes.filter((s) => s.animate).length;
  const reusedScenes = scenes.filter(
    (s) => normalizeImportance(s.importance) === "LOW"
  ).length;

  const naiveTotal = totalScenes * naiveSceneCost();
  const falCallsSavedPct =
    totalScenes > 0
      ? Math.round(((totalScenes - animatedScenes) / totalScenes) * 100)
      : 0;

  const tierStats = IMPORTANCE_TIERS.map((tier) => {
    const tierScenes = scenes.filter(
      (s) => normalizeImportance(s.importance) === tier
    );
    const cost = tierScenes.reduce((sum, s) => sum + sceneCost(s), 0);
    return { tier, count: tierScenes.length, cost };
  });
  const maxTierCost = Math.max(1e-9, ...tierStats.map((t) => t.cost));

  const providerTotals = new Map<
    string,
    { calls: number; units: number; cost: number }
  >();
  for (const row of apiUsage) {
    const key = row.provider ?? "unknown";
    const entry = providerTotals.get(key) ?? { calls: 0, units: 0, cost: 0 };
    entry.calls += 1;
    entry.units += row.units ?? 0;
    entry.cost += row.cost_usd ?? 0;
    providerTotals.set(key, entry);
  }
  const providerRows = Array.from(providerTotals.entries()).sort(
    (a, b) => b[1].cost - a[1].cost
  );
  const liveSpendTotal = providerRows.reduce((sum, [, v]) => sum + v.cost, 0);

  if (errored) {
    return (
      <div>
        <PageHeader
          title="API Usage & Cost"
          description="Track API spend and usage across providers."
        />
        <EmptyState
          icon={Wallet}
          title="Couldn't load cost data"
          description="There was a problem reaching Supabase. Check your connection."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="API Usage & Cost"
        description="Planned generation cost, computed from the scene decision engine, plus live provider spend."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total planned cost"
          value={formatUsd(totalPlanned)}
          icon={Wallet}
        />
        <StatCard
          label="Avg. cost / video"
          value={formatUsd(avgPerVideo)}
          icon={Coins}
        />
        <StatCard
          label="Scenes reused (LOW)"
          value={`${reusedScenes} / ${totalScenes}`}
          icon={Recycle}
        />
        <StatCard
          label="fal calls saved vs naive"
          value={`${falCallsSavedPct}%`}
          icon={TrendingDown}
        />
      </div>

      {/* Usage counters (usage_counters, rolled up on every load) */}
      <div className="mt-8 rounded-xl border border-border bg-elevated p-5">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">
            Usage this period{usageCounters ? ` · ${usageCounters.period}` : ""}
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clapperboard className="h-3.5 w-3.5" strokeWidth={1.75} />
              Videos
            </span>
            <span className="text-lg font-semibold tabular-nums text-foreground">
              {usageCounters?.videos ?? 0}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Cpu className="h-3.5 w-3.5" strokeWidth={1.75} />
              AI calls
            </span>
            <span className="text-lg font-semibold tabular-nums text-foreground">
              {usageCounters?.ai_calls ?? 0}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Wallet className="h-3.5 w-3.5" strokeWidth={1.75} />
              Cost
            </span>
            <span className="text-lg font-semibold tabular-nums text-foreground">
              {formatUsd(usageCounters?.cost_usd ?? 0, 4)}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <HardDrive className="h-3.5 w-3.5" strokeWidth={1.75} />
              Storage
            </span>
            <span className="text-lg font-semibold tabular-nums text-foreground">
              {formatBytes(usageCounters?.storage_bytes ?? 0)}
            </span>
          </div>
        </div>
      </div>

      {/* Budget vs planned cost per story */}
      <div className="mt-8 rounded-xl border border-border bg-elevated">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">
            Budget vs. planned cost
          </h2>
          <span className="text-xs tabular-nums text-muted-foreground">
            Cap {formatUsd(defaultBudget)} / video
          </span>
        </div>
        {storyPlans.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={Wallet}
              title="No stories yet"
              description="Once scenes are planned for a story, its projected cost shows up here."
            />
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {storyPlans.map(({ story, sceneCount, planned, budget }) => {
              const pct = budget > 0 ? Math.min(100, (planned / budget) * 100) : 0;
              const overBudget = planned > budget;
              return (
                <div key={story.id} className="flex flex-col gap-2.5 px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <span
                      lang="hi"
                      className="truncate text-sm font-medium text-foreground"
                    >
                      {story.topic || "Untitled story"}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {sceneCount} scenes ·{" "}
                      <span
                        className={cn(
                          "font-medium",
                          overBudget ? "text-[var(--status-failed)]" : "text-foreground"
                        )}
                      >
                        {formatUsd(planned)}
                      </span>{" "}
                      / {formatUsd(budget)}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-surface">
                    <div
                      className="h-full rounded-full transition-[width] duration-300 ease-out"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: overBudget
                          ? "var(--status-failed)"
                          : "var(--primary)",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cost breakdown by scene importance */}
      <div className="mt-8 rounded-xl border border-border bg-elevated p-5">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">
            Cost breakdown by scene importance
          </h2>
          <span className="text-xs tabular-nums text-muted-foreground">
            Naive (animate-all) cost: {formatUsd(naiveTotal)}
          </span>
        </div>
        {totalScenes === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="No scenes planned yet"
            description="Once a story's scenes are broken down, cost tiers show up here."
          />
        ) : (
          <div className="flex flex-col gap-4">
            {tierStats.map(({ tier, count, cost }) => (
              <div key={tier} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 font-medium text-foreground">
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: TIER_STYLE[tier].color }}
                      aria-hidden="true"
                    />
                    {tier}
                    <span className="font-normal text-muted-foreground">
                      · {TIER_STYLE[tier].note}
                    </span>
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {count} scene{count === 1 ? "" : "s"} · {formatUsd(cost)}
                  </span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-surface">
                  <div
                    className="h-full rounded-full transition-[width] duration-300 ease-out"
                    style={{
                      width: `${(cost / maxTierCost) * 100}%`,
                      backgroundColor: TIER_STYLE[tier].color,
                      opacity: 0.85,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Provider cost table */}
      <div className="mt-8 rounded-xl border border-border bg-elevated">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">
            Live provider spend
          </h2>
          <span className="text-xs tabular-nums text-muted-foreground">
            {formatUsd(liveSpendTotal, 4)} total
          </span>
        </div>
        {providerRows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={Coins}
              title="No live spend yet"
              description="All dev runs are $0 — recorded provider spend will show up here once generation runs."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Provider</th>
                  <th className="px-5 py-3 font-medium">Calls</th>
                  <th className="px-5 py-3 font-medium">Units</th>
                  <th className="px-5 py-3 font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {providerRows.map(([provider, v]) => (
                  <tr key={provider} className="border-b border-border/60 last:border-0">
                    <td className="px-5 py-3 font-medium capitalize text-foreground">
                      {provider}
                    </td>
                    <td className="px-5 py-3 tabular-nums text-muted-foreground">
                      {v.calls}
                    </td>
                    <td className="px-5 py-3 tabular-nums text-muted-foreground">
                      {v.units.toLocaleString()}
                    </td>
                    <td className="px-5 py-3 tabular-nums text-foreground">
                      {formatUsd(v.cost, 4)}
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
