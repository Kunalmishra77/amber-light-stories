import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  AudioLines,
  Bell,
  BookOpen,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FolderKanban,
  HardDrive,
  KeyRound,
  Layers,
  LineChart,
  Loader2,
  ScrollText,
  Send,
  ShieldAlert,
  Sparkles,
  Users,
  Video,
  Wallet,
  Wand2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId, getProfile } from "@/lib/auth";
import { getTenantBrand } from "@/lib/branding";
import { rollupUsage } from "@/lib/ops/usage";
import { formatUsd } from "@/lib/cost";
import { stageLabel } from "@/lib/pipeline/stage-content";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";

// This dashboard reads live counts straight from Supabase on every request,
// so it must never be statically prerendered / cached at build time.
export const dynamic = "force-dynamic";

type Supabase = Awaited<ReturnType<typeof createClient>>;

interface PlanItemLite {
  id: string;
  scheduled_date: string;
  topic: string | null;
  pillar: string | null;
  status: string;
}

interface RunningRun {
  id: string;
  story_id: string | null;
  current_stage: string | null;
  started_at: string | null;
}

interface FailedStage {
  id: string;
  stage: string;
  last_error: string | null;
  updated_at: string;
}

interface StoryReady {
  id: string;
  topic: string | null;
  status: string | null;
}

interface VideoLite {
  id: string;
  topic: string | null;
  status: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  created_at: string | null;
}

interface CredentialLite {
  provider: string;
  status: string | null;
}

interface ScheduleLite {
  timezone: string | null;
  days: number[] | null;
  publish_times: string[] | null;
  emergency_stop: boolean | null;
  holiday_mode: boolean | null;
}

interface AuditLogLite {
  id: string;
  action: string;
  target: string | null;
  created_at: string;
}

const CREDENTIAL_PROVIDERS: { provider: string; label: string }[] = [
  { provider: "openai", label: "OpenAI" },
  { provider: "gemini", label: "Gemini" },
  { provider: "elevenlabs", label: "ElevenLabs" },
  { provider: "fal", label: "fal.ai" },
  { provider: "youtube", label: "YouTube" },
  { provider: "gmail", label: "Gmail" },
];

const CREDENTIAL_DOT_COLOR: Record<string, string> = {
  connected: "var(--status-approved)",
  invalid: "var(--status-failed)",
  expired: "var(--status-failed)",
  missing_permission: "var(--status-failed)",
  quota_exceeded: "var(--status-paused)",
};

function credentialDotColor(status: string | null) {
  return CREDENTIAL_DOT_COLOR[status ?? ""] ?? "var(--status-pending)";
}

/** Rough per-asset size estimate — mirrors src/lib/ops/usage.ts (not exported
 * from there, so duplicated here rather than importing an internal const). */
const ASSET_SIZE_ESTIMATE_BYTES = 1_500_000;

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function formatShortDate(value: string) {
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatTime(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 MB";
  const mb = bytes / 1_000_000;
  if (mb < 1000) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1000).toFixed(2)} GB`;
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

async function getCount(supabase: Supabase, table: string, tenantId: string) {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  if (error) return null;
  return count ?? 0;
}

async function getCountWithStatus(
  supabase: Supabase,
  table: string,
  tenantId: string,
  column: string,
  values: string[]
) {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .in(column, values);
  if (error) return null;
  return count ?? 0;
}

/** Small card shell shared by every dashboard card below. */
function DashboardCard({
  icon: Icon,
  title,
  href,
  hrefLabel,
  badge,
  tone = "primary",
  children,
}: {
  icon: LucideIcon;
  title: string;
  href?: string;
  hrefLabel?: string;
  badge?: ReactNode;
  tone?: "primary" | "danger";
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-border bg-elevated">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Icon
            className={cn("h-4 w-4", tone === "danger" ? "text-[var(--status-failed)]" : "text-primary")}
            strokeWidth={1.75}
          />
          {title}
        </h2>
        {badge ?? (
          href ? (
            <Link href={href} className="text-xs text-muted-foreground hover:text-foreground">
              {hrefLabel ?? "View all"}
            </Link>
          ) : null
        )}
      </div>
      <div className="flex-1 p-5">{children}</div>
    </div>
  );
}

export default async function OverviewPage() {
  const supabase = await createClient();
  const tenantId = (await getCurrentTenantId()) ?? "";

  const today = new Date();
  const todayStr = isoDate(today);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = isoDate(tomorrow);
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekEndStr = isoDate(weekEnd);

  const [profile, brand] = await Promise.all([getProfile(), getTenantBrand(tenantId)]);

  const [
    projectsCount,
    charactersCount,
    voicesCount,
    videosCount,
    storiesCount,
    tenantRes,
    scheduleRes,
    planRes,
    todayItemsRes,
    tomorrowItemsRes,
    upcomingItemsRes,
    runningRunsRes,
    awaitingReviewRes,
    plannedCountRes,
    failedStagesCountRes,
    failedStagesRes,
    failedRenderJobsCountRes,
    activeRenderJobsCountRes,
    storiesReadyCountRes,
    planApprovedCountRes,
    storiesReadyRes,
    videosRes,
    assetsCountRes,
    credentialsRes,
    unreadNotifRes,
    auditLogRes,
  ] = await Promise.all([
    getCount(supabase, "projects", tenantId),
    getCount(supabase, "characters", tenantId),
    getCount(supabase, "voices", tenantId),
    getCount(supabase, "videos", tenantId),
    getCount(supabase, "stories", tenantId),
    supabase.from("tenants").select("name").eq("id", tenantId).maybeSingle<{ name: string }>(),
    supabase
      .from("schedules")
      .select("timezone, days, publish_times, emergency_stop, holiday_mode")
      .eq("tenant_id", tenantId)
      .maybeSingle<ScheduleLite>(),
    supabase
      .from("content_plans")
      .select("id, month, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; month: string | null; created_at: string | null }>(),
    supabase
      .from("plan_items")
      .select("id, scheduled_date, topic, pillar, status")
      .eq("tenant_id", tenantId)
      .eq("scheduled_date", todayStr)
      .order("position", { ascending: true }),
    supabase
      .from("plan_items")
      .select("id, scheduled_date, topic, pillar, status")
      .eq("tenant_id", tenantId)
      .eq("scheduled_date", tomorrowStr)
      .order("position", { ascending: true }),
    supabase
      .from("plan_items")
      .select("id, scheduled_date, topic, pillar, status")
      .eq("tenant_id", tenantId)
      .gt("scheduled_date", tomorrowStr)
      .lte("scheduled_date", weekEndStr)
      .order("scheduled_date", { ascending: true })
      .limit(6),
    supabase
      .from("pipeline_runs")
      .select("id, story_id, current_stage, started_at")
      .eq("tenant_id", tenantId)
      .eq("status", "running")
      .order("started_at", { ascending: false })
      .limit(12),
    supabase
      .from("pipeline_stages")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "awaiting_review"),
    supabase
      .from("plan_items")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "planned"),
    supabase
      .from("pipeline_stages")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "failed"),
    supabase
      .from("pipeline_stages")
      .select("id, stage, last_error, updated_at")
      .eq("tenant_id", tenantId)
      .eq("status", "failed")
      .order("updated_at", { ascending: false })
      .limit(5),
    supabase
      .from("render_jobs")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "failed"),
    getCountWithStatus(supabase, "render_jobs", tenantId, "status", ["queued", "running"]),
    getCountWithStatus(supabase, "stories", tenantId, "status", ["ready", "approved"]),
    supabase
      .from("plan_items")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "approved"),
    supabase
      .from("stories")
      .select("id, topic, status")
      .eq("tenant_id", tenantId)
      .in("status", ["ready", "approved"])
      .limit(5),
    supabase
      .from("videos")
      .select("id, topic, status, scheduled_at, published_at, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(50),
    getCount(supabase, "assets", tenantId),
    supabase.from("tenant_credentials").select("provider, status").eq("tenant_id", tenantId),
    supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("read", false),
    supabase
      .from("audit_log")
      .select("id, action, target, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const usage = await rollupUsage(tenantId);

  const tenantName = tenantRes.data?.name ?? "Your workspace";
  const displayName = brand.display_name || tenantName;
  const firstName = (profile?.full_name ?? "").trim().split(/\s+/)[0] || null;

  const schedule = scheduleRes.data ?? null;
  const plan = planRes.data ?? null;
  const todayItems = (todayItemsRes.data as PlanItemLite[] | null) ?? [];
  const tomorrowItems = (tomorrowItemsRes.data as PlanItemLite[] | null) ?? [];
  const upcomingItems = (upcomingItemsRes.data as PlanItemLite[] | null) ?? [];
  const runningRuns = (runningRunsRes.data as RunningRun[] | null) ?? [];
  const generatingNow = runningRuns.filter((r) => r.current_stage !== "render");
  const renderingNow = runningRuns.filter((r) => r.current_stage === "render");
  const awaitingReviewCount = awaitingReviewRes.count ?? 0;
  const plannedCount = plannedCountRes.count ?? 0;
  const pendingApprovalsTotal = awaitingReviewCount + plannedCount;
  const failedStagesCount = failedStagesCountRes.count ?? 0;
  const failedStages = (failedStagesRes.data as FailedStage[] | null) ?? [];
  const failedRenderJobsCount = failedRenderJobsCountRes.count ?? 0;
  const errorsTotal = failedStagesCount + failedRenderJobsCount;
  const activeRenderJobsCount = activeRenderJobsCountRes ?? 0;
  const storiesReadyCount = storiesReadyCountRes ?? 0;
  const planApprovedCount = planApprovedCountRes.count ?? 0;
  const contentReadyTotal = storiesReadyCount + planApprovedCount;
  const storiesReady = (storiesReadyRes.data as StoryReady[] | null) ?? [];
  const videos = (videosRes.data as VideoLite[] | null) ?? [];
  const assetsCount = assetsCountRes ?? 0;
  const credentialByProvider = new Map(
    ((credentialsRes.data as CredentialLite[] | null) ?? []).map((c) => [c.provider, c.status] as const)
  );
  const unreadNotifications = unreadNotifRes.count ?? 0;
  const auditLogs = (auditLogRes.data as AuditLogLite[] | null) ?? [];

  // Story topics for currently-running pipeline runs (generating + rendering).
  const storyIds = runningRuns.map((r) => r.story_id).filter((id): id is string => !!id);
  const { data: runningStories } =
    storyIds.length > 0
      ? await supabase.from("stories").select("id, topic").in("id", storyIds).eq("tenant_id", tenantId)
      : { data: [] as { id: string; topic: string | null }[] };
  const storyTopicById = new Map((runningStories ?? []).map((s) => [s.id, s.topic] as const));

  // Publishing status, from the recent videos already loaded above.
  const uploadsScheduledToday = videos.filter(
    (v) => v.status === "scheduled" && v.scheduled_at?.slice(0, 10) === todayStr
  ).length;
  const uploadsPublishedToday = videos.filter(
    (v) => (v.status === "published" || v.status === "done") && v.published_at?.slice(0, 10) === todayStr
  ).length;
  const uploadsFailedToday = videos.filter(
    (v) => v.status === "failed" && (v.scheduled_at ?? v.created_at)?.slice(0, 10) === todayStr
  ).length;

  const isBrandNew =
    !plan && (projectsCount ?? 0) === 0 && (storiesCount ?? 0) === 0 && (videosCount ?? 0) === 0;

  const statusParts: string[] = [
    `${todayItems.length} video${todayItems.length === 1 ? "" : "s"} scheduled today`,
    `${generatingNow.length + renderingNow.length} rendering`,
    `${pendingApprovalsTotal} need${pendingApprovalsTotal === 1 ? "s" : ""} your approval`,
  ];
  if (errorsTotal > 0) statusParts.push(`${errorsTotal} error${errorsTotal === 1 ? "" : "s"} need attention`);

  const stats = [
    { label: "Projects", value: projectsCount, icon: FolderKanban },
    { label: "Stories", value: storiesCount, icon: BookOpen },
    { label: "Characters", value: charactersCount, icon: Users },
    { label: "Voices", value: voicesCount, icon: AudioLines },
    { label: "Videos", value: videosCount, icon: Video },
    { label: "Pipeline runs", value: runningRuns.length, icon: Activity },
  ];

  return (
    <div>
      {/* Today hero strip */}
      <div className="mb-6 flex flex-col gap-3 rounded-xl border border-border bg-elevated p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {greeting()}
            {firstName ? `, ${firstName}` : ""}
            <span className="text-muted-foreground"> — {displayName}</span>
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} ·{" "}
            {statusParts.join(", ")}.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs tabular-nums text-muted-foreground">
          <Link
            href="/notifications"
            className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 hover:text-foreground"
          >
            <Bell className="h-3.5 w-3.5" strokeWidth={1.75} />
            {unreadNotifications} unread
          </Link>
        </div>
      </div>

      {!plan ? (
        <div className="mb-6 flex flex-col items-start justify-between gap-4 rounded-xl border border-primary/25 bg-primary/5 p-5 shadow-sm sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                Generate your 30-day plan to get started
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                A free, editable content strategy built from your tenant profile — $0, no paid API calls.
              </p>
            </div>
          </div>
          <Link
            href="/planner"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-on-primary transition-colors hover:bg-primary-hover"
          >
            Open Content Planner
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
          </Link>
        </div>
      ) : null}

      {schedule?.emergency_stop ? (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-[var(--status-failed)]/40 bg-[var(--status-failed)]/10 p-4 text-sm text-[var(--status-failed)]">
          <ShieldAlert className="h-4 w-4 shrink-0" strokeWidth={2} />
          Emergency stop is ON for this workspace — publishing is halted.
          <Link href="/schedule" className="ml-auto underline hover:no-underline">
            Review scheduler
          </Link>
        </div>
      ) : null}

      {/* Quick actions */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <QuickAction href="/generate" icon={Wand2} label="Generate video" />
        <QuickAction href="/approvals" icon={ClipboardCheck} label="Review approvals" badge={pendingApprovalsTotal} />
        <QuickAction href="/calendar" icon={CalendarDays} label="View calendar" />
        <QuickAction href="/pipeline" icon={Activity} label="Open pipeline" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {stats.map((stat) => (
          <StatCard key={stat.label} label={stat.label} value={stat.value ?? 0} icon={stat.icon} error={stat.value === null} />
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Today's schedule + tomorrow's uploads */}
        <DashboardCard icon={CalendarClock} title="Today & tomorrow" href="/planner" hrefLabel="Open planner">
          <div className="flex flex-col gap-5">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Today · {todayItems.length}
              </p>
              {todayItems.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nothing scheduled today.</p>
              ) : (
                <div className="flex flex-col divide-y divide-border">
                  {todayItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 py-2">
                      <span lang="en" className="line-clamp-1 text-sm font-medium text-foreground">
                        {item.topic || "Untitled topic"}
                      </span>
                      <StatusBadge status={item.status} className="shrink-0" />
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Tomorrow · {tomorrowItems.length}
              </p>
              {tomorrowItems.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nothing queued for tomorrow yet.</p>
              ) : (
                <div className="flex flex-col divide-y divide-border">
                  {tomorrowItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 py-2">
                      <span lang="en" className="line-clamp-1 text-sm font-medium text-foreground">
                        {item.topic || "Untitled topic"}
                      </span>
                      <StatusBadge status={item.status} className="shrink-0" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DashboardCard>

        {/* Generating now */}
        <DashboardCard
          icon={Loader2}
          title="Generating now"
          badge={<span className="text-xs tabular-nums text-muted-foreground">{generatingNow.length}</span>}
        >
          {generatingNow.length === 0 ? (
            <EmptyState icon={Activity} title="Nothing generating" description="Running pipeline stages will show up here." />
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {generatingNow.map((run) => (
                <Link
                  key={run.id}
                  href="/pipeline"
                  className="flex items-center justify-between gap-3 py-2.5 hover:text-primary"
                >
                  <span lang="en" className="line-clamp-1 text-sm font-medium text-foreground">
                    {(run.story_id && storyTopicById.get(run.story_id)) || "Untitled story"}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {run.current_stage ? stageLabel(run.current_stage) : "—"}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </DashboardCard>

        {/* Rendering */}
        <DashboardCard
          icon={Layers}
          title="Rendering"
          href="/rendering"
          badge={<span className="text-xs tabular-nums text-muted-foreground">{renderingNow.length + activeRenderJobsCount}</span>}
        >
          {renderingNow.length === 0 && activeRenderJobsCount === 0 ? (
            <EmptyState icon={Layers} title="Nothing rendering" description="Active render jobs will show up here." />
          ) : (
            <div className="flex flex-col gap-3">
              {renderingNow.length > 0 ? (
                <div className="flex flex-col divide-y divide-border">
                  {renderingNow.map((run) => (
                    <Link
                      key={run.id}
                      href="/rendering"
                      className="flex items-center justify-between gap-3 py-2.5 hover:text-primary"
                    >
                      <span lang="en" className="line-clamp-1 text-sm font-medium text-foreground">
                        {(run.story_id && storyTopicById.get(run.story_id)) || "Untitled story"}
                      </span>
                      <StatusBadge status="running" className="shrink-0" />
                    </Link>
                  ))}
                </div>
              ) : null}
              {activeRenderJobsCount > 0 ? (
                <p className="text-xs tabular-nums text-muted-foreground">
                  {activeRenderJobsCount} render job{activeRenderJobsCount === 1 ? "" : "s"} queued or in progress.
                </p>
              ) : null}
            </div>
          )}
        </DashboardCard>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Pending approvals */}
        <DashboardCard
          icon={ClipboardCheck}
          title="Pending approvals"
          href="/approvals"
          badge={<span className="text-xs tabular-nums text-muted-foreground">{pendingApprovalsTotal}</span>}
        >
          {pendingApprovalsTotal === 0 ? (
            <EmptyState icon={ClipboardCheck} title="All caught up" description="Nothing waiting on your review right now." />
          ) : (
            <div className="flex flex-col gap-2">
              <Link
                href="/pipeline"
                className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground hover:bg-elevated"
              >
                Pipeline stages awaiting review
                <span className="tabular-nums text-muted-foreground">{awaitingReviewCount}</span>
              </Link>
              <Link
                href="/planner"
                className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground hover:bg-elevated"
              >
                Plan items awaiting approval
                <span className="tabular-nums text-muted-foreground">{plannedCount}</span>
              </Link>
            </div>
          )}
        </DashboardCard>

        {/* Content ready */}
        <DashboardCard
          icon={CheckCircle2}
          title="Content ready"
          href="/stories"
          badge={<span className="text-xs tabular-nums text-muted-foreground">{contentReadyTotal}</span>}
        >
          {contentReadyTotal === 0 ? (
            <EmptyState icon={CheckCircle2} title="Nothing ready yet" description="Approved stories and plan items will show up here." />
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-muted-foreground">
                {storiesReadyCount} stor{storiesReadyCount === 1 ? "y" : "ies"} ready · {planApprovedCount} plan item
                {planApprovedCount === 1 ? "" : "s"} approved
              </p>
              {storiesReady.length > 0 ? (
                <div className="flex flex-col divide-y divide-border">
                  {storiesReady.map((story) => (
                    <div key={story.id} className="flex items-center justify-between gap-3 py-2">
                      <span lang="en" className="line-clamp-1 text-sm font-medium text-foreground">
                        {story.topic || "Untitled story"}
                      </span>
                      <StatusBadge status={story.status ?? "ready"} className="shrink-0" />
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </DashboardCard>

        {/* Errors */}
        <DashboardCard
          icon={AlertCircle}
          title="Errors"
          href="/logs"
          tone="danger"
          badge={
            <span
              className={cn(
                "text-xs tabular-nums",
                errorsTotal > 0 ? "font-semibold text-[var(--status-failed)]" : "text-muted-foreground"
              )}
            >
              {errorsTotal}
            </span>
          }
        >
          {errorsTotal === 0 ? (
            <EmptyState icon={CheckCircle2} title="No errors" description="Failed stages and jobs will show up here." />
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {failedStages.map((stage) => (
                <div key={stage.id} className="flex flex-col gap-0.5 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium capitalize text-foreground">
                      {stageLabel(stage.stage)}
                    </span>
                    <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                      {formatTime(stage.updated_at)}
                    </span>
                  </div>
                  <span className="line-clamp-1 text-xs text-[var(--status-failed)]">
                    {stage.last_error ?? "Failed — see logs for detail."}
                  </span>
                </div>
              ))}
              {failedRenderJobsCount > 0 ? (
                <p className="pt-2 text-xs text-[var(--status-failed)]">
                  {failedRenderJobsCount} render job{failedRenderJobsCount === 1 ? "" : "s"} failed.
                </p>
              ) : null}
            </div>
          )}
        </DashboardCard>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Publishing status */}
        <DashboardCard icon={Send} title="Publishing today" href="/publishing">
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Scheduled</span>
              <span className="tabular-nums font-medium text-foreground">{uploadsScheduledToday}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Published</span>
              <span className="tabular-nums font-medium text-[var(--status-approved)]">{uploadsPublishedToday}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Failed</span>
              <span
                className={cn(
                  "tabular-nums font-medium",
                  uploadsFailedToday > 0 ? "text-[var(--status-failed)]" : "text-foreground"
                )}
              >
                {uploadsFailedToday}
              </span>
            </div>
          </div>
        </DashboardCard>

        {/* Storage */}
        <DashboardCard icon={HardDrive} title="Storage" href="/assets">
          <div className="flex flex-col gap-1">
            <span className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
              {formatBytes(assetsCount * ASSET_SIZE_ESTIMATE_BYTES)}
            </span>
            <span className="text-xs text-muted-foreground">
              {assetsCount} asset{assetsCount === 1 ? "" : "s"} · estimated size
            </span>
          </div>
        </DashboardCard>

        {/* AI usage & cost */}
        <DashboardCard icon={Wallet} title="AI usage & cost" href="/usage">
          {usage ? (
            <div className="flex flex-col gap-1">
              <span className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
                {formatUsd(usage.cost_usd)}
              </span>
              <span className="text-xs text-muted-foreground">
                {usage.ai_calls} AI call{usage.ai_calls === 1 ? "" : "s"} · {usage.videos} video
                {usage.videos === 1 ? "" : "s"} this period
              </span>
            </div>
          ) : (
            <EmptyState icon={Wallet} title="No usage yet" description="AI calls and spend for this period will show up here." />
          )}
        </DashboardCard>

        {/* API health */}
        <DashboardCard icon={KeyRound} title="API health" href="/api-management">
          <div className="flex flex-wrap gap-2">
            {CREDENTIAL_PROVIDERS.map(({ provider, label }) => {
              const status = credentialByProvider.get(provider) ?? null;
              return (
                <span
                  key={provider}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-foreground"
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: credentialDotColor(status) }}
                    aria-hidden="true"
                  />
                  {label}
                </span>
              );
            })}
          </div>
        </DashboardCard>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Latest analytics */}
        <DashboardCard icon={LineChart} title="Latest analytics" href="/analytics">
          <EmptyState
            icon={LineChart}
            title="Connect a channel"
            description="Link a YouTube channel to see views, watch time, and subscriber growth here."
          />
        </DashboardCard>

        {/* Recent activity */}
        <DashboardCard icon={ScrollText} title="Recent activity" href="/logs">
          {auditLogs.length === 0 ? (
            <EmptyState icon={ScrollText} title="No activity yet" description="Actions taken in this workspace will show up here." />
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {auditLogs.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="line-clamp-1 text-xs font-medium text-foreground">{row.action}</span>
                  <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                    {formatTime(row.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DashboardCard>
      </div>

      {/* Upcoming scheduled jobs */}
      <div className="mt-6 rounded-xl border border-border bg-elevated">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Clock className="h-4 w-4 text-primary" strokeWidth={1.75} />
            Upcoming scheduled jobs
          </h2>
          <Link href="/schedule" className="text-xs text-muted-foreground hover:text-foreground">
            Manage scheduler
          </Link>
        </div>
        <div className="p-5">
          {schedule ? (
            <p className="mb-4 text-xs text-muted-foreground">
              Publishing at {(schedule.publish_times ?? []).join(", ") || "no times set"} (
              {schedule.timezone ?? "UTC"}){schedule.holiday_mode ? " · holiday mode on" : ""}
            </p>
          ) : (
            <p className="mb-4 text-xs text-muted-foreground">
              No scheduler configured yet.{" "}
              <Link href="/schedule" className="text-primary hover:text-primary-hover">
                Set one up
              </Link>
              .
            </p>
          )}
          {upcomingItems.length === 0 ? (
            <EmptyState icon={CalendarDays} title="Nothing else queued this week" description="More plan items will show up here as they're scheduled." />
          ) : (
            <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0 md:grid-cols-6">
              {upcomingItems.map((item) => (
                <div key={item.id} className="flex flex-col gap-1.5 px-3 py-3 first:pl-0">
                  <span className="text-xs font-medium text-muted-foreground">
                    {formatShortDate(item.scheduled_date)}
                  </span>
                  <span lang="en" className="line-clamp-2 text-xs font-medium text-foreground">
                    {item.topic || "Untitled"}
                  </span>
                  <StatusBadge status={item.status} className="w-fit" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {isBrandNew ? (
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Brand-new workspace — generate a plan, connect API credentials, and set up your scheduler to bring this
          dashboard to life.
        </p>
      ) : null}
    </div>
  );
}

function QuickAction({
  href,
  icon: Icon,
  label,
  badge,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-border bg-elevated p-4 shadow-sm transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/30"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{label}</p>
      </div>
      {badge ? (
        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-primary">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}
