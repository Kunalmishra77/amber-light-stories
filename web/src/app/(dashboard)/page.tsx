import Link from "next/link";
import {
  FolderKanban,
  Users,
  AudioLines,
  Clapperboard,
  BookOpen,
  Activity,
  Sparkles,
  CalendarDays,
  CalendarClock,
  Loader2,
  ClipboardCheck,
  Video,
  KeyRound,
  HardDrive,
  Bell,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";

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

async function getCount(supabase: Supabase, table: string, tenantId: string) {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  if (error) return null;
  return count ?? 0;
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function formatShortDate(value: string) {
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

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

export default async function OverviewPage() {
  const supabase = await createClient();
  const tenantId = (await getCurrentTenantId()) ?? "";

  const today = new Date();
  const todayStr = isoDate(today);
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekEndStr = isoDate(weekEnd);

  const [
    projects,
    characters,
    voices,
    videosCount,
    stories,
    pipelineRunsCount,
    tenantRes,
    scheduleRes,
    planRes,
    todayItemsRes,
    weekItemsRes,
    runningRunsRes,
    awaitingReviewRes,
    videosRes,
    credentialsRes,
    unreadNotifRes,
  ] = await Promise.all([
    getCount(supabase, "projects", tenantId),
    getCount(supabase, "characters", tenantId),
    getCount(supabase, "voices", tenantId),
    getCount(supabase, "videos", tenantId),
    getCount(supabase, "stories", tenantId),
    getCount(supabase, "pipeline_runs", tenantId),
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
      .gte("scheduled_date", todayStr)
      .lte("scheduled_date", weekEndStr)
      .order("scheduled_date", { ascending: true }),
    supabase
      .from("pipeline_runs")
      .select("id, story_id, current_stage, started_at")
      .eq("tenant_id", tenantId)
      .eq("status", "running")
      .order("started_at", { ascending: false })
      .limit(6),
    supabase
      .from("pipeline_stages")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "awaiting_review"),
    supabase
      .from("videos")
      .select("id, topic, status, scheduled_at, published_at, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("tenant_credentials")
      .select("provider, status")
      .eq("tenant_id", tenantId),
    supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("read", false),
  ]);

  const tenantName = tenantRes.data?.name ?? "Your workspace";
  const schedule = scheduleRes.data ?? null;
  const plan = planRes.data ?? null;
  const todayItems = (todayItemsRes.data as PlanItemLite[] | null) ?? [];
  const weekItems = (weekItemsRes.data as PlanItemLite[] | null) ?? [];
  const runningRuns = (runningRunsRes.data as RunningRun[] | null) ?? [];
  const pendingReviewCount = awaitingReviewRes.count ?? 0;
  const videos = (videosRes.data as VideoLite[] | null) ?? [];
  const credentials = (credentialsRes.data as CredentialLite[] | null) ?? [];
  const unreadNotifications = unreadNotifRes.count ?? 0;

  // Recent story topics for currently-running pipeline runs.
  const storyIds = runningRuns.map((r) => r.story_id).filter((id): id is string => !!id);
  const { data: runningStories } =
    storyIds.length > 0
      ? await supabase
          .from("stories")
          .select("id, topic")
          .in("id", storyIds)
          .eq("tenant_id", tenantId)
      : { data: [] as { id: string; topic: string | null }[] };
  const storyTopicById = new Map(
    (runningStories ?? []).map((s) => [s.id, s.topic] as const)
  );

  // Uploads breakdown from videos.
  const uploadsToday = videos.filter((v) => {
    const d = v.scheduled_at ?? v.published_at;
    return d && d.slice(0, 10) === todayStr;
  }).length;
  const uploadsUpcoming = videos.filter(
    (v) => v.status === "scheduled" && v.scheduled_at && v.scheduled_at.slice(0, 10) > todayStr
  ).length;
  const uploadsCompleted = videos.filter(
    (v) => v.status === "published" || v.status === "done"
  ).length;
  const uploadsFailed = videos.filter((v) => v.status === "failed").length;

  const plannedApprovalCount = todayItems.filter((i) => i.status === "planned").length;
  const pendingApprovalsTotal = pendingReviewCount + plannedApprovalCount;

  const recentVideos = videos.slice(0, 6);

  // Mini 7-day calendar bucketed by date.
  const calendarDays: { date: string; items: PlanItemLite[] }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const key = isoDate(d);
    calendarDays.push({ date: key, items: weekItems.filter((it) => it.scheduled_date === key) });
  }

  const isBrandNew =
    !plan && (projects ?? 0) === 0 && (stories ?? 0) === 0 && (videosCount ?? 0) === 0;

  const stats = [
    { label: "Projects", value: projects, icon: FolderKanban },
    { label: "Characters", value: characters, icon: Users },
    { label: "Voices", value: voices, icon: AudioLines },
    { label: "Videos", value: videosCount, icon: Clapperboard },
    { label: "Stories", value: stories, icon: BookOpen },
    { label: "Pipeline runs", value: pipelineRunsCount, icon: Activity },
  ];

  return (
    <div>
      <PageHeader
        title={tenantName}
        description={`Today is ${today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} — ${todayItems.length} item${todayItems.length === 1 ? "" : "s"} scheduled, ${pendingApprovalsTotal} pending approval${pendingApprovalsTotal === 1 ? "" : "s"}, ${runningRuns.length} rendering now.`}
      />

      {!plan ? (
        <div className="mb-8 flex flex-col items-start justify-between gap-4 rounded-xl border border-primary/25 bg-primary/5 p-5 shadow-sm sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                Generate your 30-day plan to get started
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                A free, editable content strategy built from your tenant profile — $0, no paid
                API calls.
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
        <div className="mb-8 flex items-center gap-3 rounded-xl border border-[var(--status-failed)]/40 bg-[var(--status-failed)]/10 p-4 text-sm text-[var(--status-failed)]">
          <ShieldAlert className="h-4 w-4 shrink-0" strokeWidth={2} />
          Emergency stop is ON for this workspace — publishing is halted.
          <Link href="/schedule" className="ml-auto underline hover:no-underline">
            Review scheduler
          </Link>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {stats.map((stat) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value ?? 0}
            icon={stat.icon}
            error={stat.value === null}
          />
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Today's schedule */}
        <div className="rounded-xl border border-border bg-elevated lg:col-span-2">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <CalendarClock className="h-4 w-4 text-primary" strokeWidth={1.75} />
              Today&apos;s schedule
            </h2>
            <Link href="/schedule" className="text-xs text-muted-foreground hover:text-foreground">
              Manage scheduler
            </Link>
          </div>
          <div className="p-5">
            {schedule ? (
              <p className="mb-4 text-xs text-muted-foreground">
                Publishing at {(schedule.publish_times ?? []).join(", ") || "no times set"} (
                {schedule.timezone ?? "UTC"})
                {schedule.holiday_mode ? " · holiday mode on" : ""}
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

            {todayItems.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title="Nothing scheduled today"
                description="Approved plan items scheduled for today will show up here."
              />
            ) : (
              <div className="flex flex-col divide-y divide-border">
                {todayItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="flex flex-col gap-0.5">
                      <span lang="en" className="text-sm font-medium text-foreground">
                        {item.topic || "Untitled topic"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {item.pillar ?? "Uncategorized"}
                      </span>
                    </div>
                    <StatusBadge status={item.status} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Currently rendering */}
        <div className="rounded-xl border border-border bg-elevated">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Loader2 className="h-4 w-4 text-primary" strokeWidth={1.75} />
              Currently rendering
            </h2>
            <span className="text-xs tabular-nums text-muted-foreground">{runningRuns.length}</span>
          </div>
          <div className="p-5">
            {runningRuns.length === 0 ? (
              <EmptyState
                icon={Activity}
                title="Nothing rendering"
                description="Pipeline runs in progress will show up here."
              />
            ) : (
              <div className="flex flex-col divide-y divide-border">
                {runningRuns.map((run) => (
                  <Link
                    key={run.id}
                    href="/pipeline"
                    className="flex items-center justify-between gap-3 py-2.5 hover:text-primary"
                  >
                    <span lang="en" className="line-clamp-1 text-sm font-medium text-foreground">
                      {(run.story_id && storyTopicById.get(run.story_id)) || "Untitled story"}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {run.current_stage ?? "—"}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Uploads today" value={uploadsToday} icon={Video} />
        <StatCard label="Uploads upcoming" value={uploadsUpcoming} icon={CalendarDays} />
        <StatCard label="Uploads completed" value={uploadsCompleted} icon={ClipboardCheck} />
        <StatCard label="Uploads failed" value={uploadsFailed} icon={ShieldAlert} error={uploadsFailed > 0} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Pending approvals */}
        <div className="rounded-xl border border-border bg-elevated">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <ClipboardCheck className="h-4 w-4 text-primary" strokeWidth={1.75} />
              Pending approvals
            </h2>
            <span className="text-xs tabular-nums text-muted-foreground">
              {pendingApprovalsTotal}
            </span>
          </div>
          <div className="flex flex-col gap-2 p-5">
            {pendingApprovalsTotal === 0 ? (
              <EmptyState
                icon={ClipboardCheck}
                title="All caught up"
                description="Nothing waiting on your review right now."
              />
            ) : (
              <>
                <Link
                  href="/pipeline"
                  className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground hover:bg-elevated"
                >
                  Pipeline stages awaiting review
                  <span className="tabular-nums text-muted-foreground">{pendingReviewCount}</span>
                </Link>
                <Link
                  href="/planner"
                  className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground hover:bg-elevated"
                >
                  Plan items awaiting approval today
                  <span className="tabular-nums text-muted-foreground">
                    {plannedApprovalCount}
                  </span>
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Recent videos */}
        <div className="rounded-xl border border-border bg-elevated">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Clapperboard className="h-4 w-4 text-primary" strokeWidth={1.75} />
              Recent videos
            </h2>
            <Link href="/videos" className="text-xs text-muted-foreground hover:text-foreground">
              View all
            </Link>
          </div>
          <div className="p-5">
            {recentVideos.length === 0 ? (
              <EmptyState
                icon={Clapperboard}
                title="No videos yet"
                description="Videos rendered by the pipeline will show up here."
              />
            ) : (
              <div className="flex flex-col divide-y divide-border">
                {recentVideos.map((video) => (
                  <div key={video.id} className="flex items-center justify-between gap-3 py-2.5">
                    <span lang="en" className="line-clamp-1 text-sm font-medium text-foreground">
                      {video.topic || "Untitled video"}
                    </span>
                    <StatusBadge status={video.status ?? "pending"} className="shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* API status + storage */}
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-border bg-elevated">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <KeyRound className="h-4 w-4 text-primary" strokeWidth={1.75} />
                API status
              </h2>
            </div>
            <div className="p-5">
              {credentials.length === 0 ? (
                <EmptyState
                  icon={KeyRound}
                  title="No providers connected"
                  description="Connect API credentials during onboarding to see their status here."
                />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {credentials.map((cred) => (
                    <span
                      key={cred.provider}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-foreground"
                    >
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: credentialDotColor(cred.status) }}
                        aria-hidden="true"
                      />
                      {cred.provider}
                      <span className="text-muted-foreground">
                        · {(cred.status ?? "unknown").replace(/_/g, " ")}
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-border bg-elevated p-4">
            <HardDrive className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
            <p className="text-xs text-muted-foreground">
              Rendered videos and assets are stored via provider webhooks. Usage/quota tracking
              arrives in a later phase.
            </p>
          </div>
        </div>
      </div>

      {/* Mini content calendar (next 7 days) */}
      <div className="mt-6 rounded-xl border border-border bg-elevated">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <CalendarDays className="h-4 w-4 text-primary" strokeWidth={1.75} />
            Next 7 days
          </h2>
          <div className="flex items-center gap-3">
            <Link
              href="/notifications"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Bell className="h-3.5 w-3.5" strokeWidth={1.75} />
              {unreadNotifications} unread
            </Link>
            <Link href="/planner" className="text-xs text-muted-foreground hover:text-foreground">
              Open planner
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-7 sm:divide-x sm:divide-y-0">
          {calendarDays.map((day) => (
            <div key={day.date} className="flex flex-col gap-2 p-4">
              <span className="text-xs font-medium text-muted-foreground">
                {formatShortDate(day.date)}
              </span>
              {day.items.length === 0 ? (
                <span className="text-xs text-muted-foreground">—</span>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {day.items.slice(0, 2).map((item) => (
                    <span
                      key={item.id}
                      lang="en"
                      className="line-clamp-2 text-xs font-medium text-foreground"
                    >
                      {item.topic || "Untitled"}
                    </span>
                  ))}
                  {day.items.length > 2 ? (
                    <span className="text-[11px] text-muted-foreground">
                      +{day.items.length - 2} more
                    </span>
                  ) : null}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {isBrandNew ? (
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Brand-new workspace — generate a plan, connect API credentials, and set up your
          scheduler to bring this dashboard to life.
        </p>
      ) : null}
    </div>
  );
}
