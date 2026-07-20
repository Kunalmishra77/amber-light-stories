import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowRight,
  Building2,
  Clapperboard,
  Clock,
  CreditCard,
  Globe,
  KeyRound,
  Paintbrush,
  Power,
  Target,
  Users,
  Users2,
  Wand2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId, getMyMemberships } from "@/lib/auth";
import { resolveAssetUrl } from "@/lib/assets";
import { getTenantBrand } from "@/lib/branding";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";

// Reads live rows from Supabase on every request — never prerender this.
export const dynamic = "force-dynamic";

interface TenantSettingsLite {
  industry: string | null;
  timezone: string | null;
  country: string | null;
  language: string | null;
  target_platform: string | null;
  config: Record<string, unknown> | null;
  audience: Record<string, unknown> | null;
  brand: { logo_url?: string | null } | null;
}

interface PlanRow {
  id: string;
  name: string;
  slug: string | null;
}

interface SubscriptionRow {
  id: string;
  status: string | null;
  plan: PlanRow | PlanRow[] | null;
}

interface CredentialLite {
  provider: string;
  status: string | null;
}

interface VideoLite {
  id: string;
  topic: string | null;
  status: string | null;
  created_at: string | null;
}

interface QuickLink {
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
}

const QUICK_LINKS: QuickLink[] = [
  { label: "Content Strategy", description: "Pillars, cadence & audience", href: "/strategy", icon: Target },
  { label: "AI Generator", description: "Create a draft story at $0", href: "/generate", icon: Wand2 },
  { label: "Content Approval", description: "Review what's waiting on you", href: "/approvals", icon: Activity },
  { label: "Brand Kit", description: "Logo, colors & voice", href: "/brand", icon: Paintbrush },
  { label: "Team", description: "Members & roles", href: "/team", icon: Users2 },
  { label: "Automation", description: "Master switch & emergency stop", href: "/automation", icon: Power },
  { label: "API Management", description: "Provider credentials", href: "/api-management", icon: KeyRound },
  { label: "Billing", description: "Plan, credits & usage", href: "/billing", icon: CreditCard },
];

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

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default async function WorkspacePage() {
  const supabase = await createClient();
  const tenantId = (await getCurrentTenantId()) ?? "";
  const todayStr = isoDate(new Date());

  const [
    { data: tenant },
    { data: settings },
    memberships,
    brand,
    counts,
    { data: subscription },
    { data: credentials },
    { data: latestPlan },
    { data: recentVideos },
    todayPlanItemsRes,
    todayVideosRes,
  ] = await Promise.all([
    supabase.from("tenants").select("name, slug, status, created_at").eq("id", tenantId).maybeSingle(),
    supabase
      .from("tenant_settings")
      .select("industry, timezone, country, language, target_platform, config, audience, brand")
      .eq("tenant_id", tenantId)
      .maybeSingle<TenantSettingsLite>(),
    getMyMemberships(),
    getTenantBrand(tenantId),
    Promise.all([
      supabase.from("stories").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId),
      supabase.from("videos").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId),
      supabase
        .from("memberships")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "active"),
    ]),
    supabase
      .from("subscriptions")
      .select("id, status, plan:plans(id, name, slug)")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<SubscriptionRow>(),
    supabase.from("tenant_credentials").select("provider, status").eq("tenant_id", tenantId),
    supabase
      .from("content_plans")
      .select("id, month")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; month: string | null }>(),
    supabase
      .from("videos")
      .select("id, topic, status, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("plan_items")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("scheduled_date", todayStr),
    supabase
      .from("videos")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "published")
      .gte("published_at", `${todayStr}T00:00:00`),
  ]);

  const [storiesCount, videosCount, memberCount] = counts.map((r) => r.count ?? 0);
  const currentMembership = memberships.find((m) => m.tenant_id === tenantId);
  const automationEnabled = Boolean((settings?.config as { automation_enabled?: boolean } | null)?.automation_enabled);
  const audience = (settings?.audience ?? {}) as { target_audience?: string | null };
  const logoUrl = await resolveAssetUrl(settings?.brand?.logo_url ?? null);
  const credentialByProvider = new Map(((credentials as CredentialLite[] | null) ?? []).map((c) => [c.provider, c.status] as const));
  const connectedCount = CREDENTIAL_PROVIDERS.filter((p) => credentialByProvider.get(p.provider) === "connected").length;

  const plan = subscription
    ? Array.isArray(subscription.plan)
      ? (subscription.plan[0] ?? null)
      : subscription.plan
    : null;

  let planApprovedCount = 0;
  let planTotalCount = 0;
  if (latestPlan) {
    const [{ count: approved }, { count: total }] = await Promise.all([
      supabase
        .from("plan_items")
        .select("*", { count: "exact", head: true })
        .eq("plan_id", latestPlan.id)
        .eq("status", "approved"),
      supabase.from("plan_items").select("*", { count: "exact", head: true }).eq("plan_id", latestPlan.id),
    ]);
    planApprovedCount = approved ?? 0;
    planTotalCount = total ?? 0;
  }
  const planProgressPct = planTotalCount > 0 ? Math.round((planApprovedCount / planTotalCount) * 100) : 0;

  const todayPlanItemsCount = todayPlanItemsRes.count ?? 0;
  const todayPublishedCount = todayVideosRes.count ?? 0;

  const videos = (recentVideos as VideoLite[] | null) ?? [];

  return (
    <div>
      <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-surface">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL
              <img src={logoUrl} alt={`${brand.display_name} logo`} className="h-full w-full object-contain" />
            ) : (
              <Building2 className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
            )}
          </div>
          <PageHeader
            title={brand.display_name || tenant?.name || "Workspace"}
            description={brand.tagline || "A quick profile of this workspace, plus shortcuts to everything you manage day to day."}
          />
        </div>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Stories" value={storiesCount} icon={Building2} />
        <StatCard label="Videos" value={videosCount} icon={Clapperboard} />
        <StatCard label="Team members" value={memberCount} icon={Users} />
        <StatCard label="Automation" value={automationEnabled ? "On" : "Off"} icon={Power} />
      </div>

      <div className="mb-6 rounded-xl border border-primary/25 bg-primary/5 p-5 shadow-sm">
        <p className="text-sm font-medium text-foreground">Today at a glance</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {todayPlanItemsCount} item{todayPlanItemsCount === 1 ? "" : "s"} scheduled today · {todayPublishedCount}{" "}
          published so far ·{" "}
          {latestPlan
            ? `${planApprovedCount}/${planTotalCount} plan items approved this month`
            : "no active content plan yet"}
          .
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-1">
          <div className="rounded-xl border border-border bg-elevated p-5 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Building2 className="h-4 w-4 text-primary" strokeWidth={1.75} />
              Workspace profile
            </h2>
            <dl className="flex flex-col gap-3 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Name</dt>
                <dd className="font-medium text-foreground">{brand.display_name || tenant?.name || "—"}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Country</dt>
                <dd className="font-medium text-foreground">{settings?.country || "Not set"}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-1.5 text-muted-foreground">
                  <Globe className="h-3.5 w-3.5" strokeWidth={1.75} /> Industry
                </dt>
                <dd className="font-medium text-foreground">{settings?.industry ?? "Not set"}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Language</dt>
                <dd className="font-medium uppercase text-foreground">{settings?.language ?? "en"}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Audience</dt>
                <dd className="max-w-[60%] truncate text-right font-medium text-foreground">
                  {audience.target_audience || "Not set"}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" strokeWidth={1.75} /> Timezone
                </dt>
                <dd className="font-medium text-foreground">{settings?.timezone ?? "UTC"}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Your role</dt>
                <dd className="font-medium capitalize text-foreground">
                  {(currentMembership?.role ?? "—").replace(/_/g, " ")}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Platform</dt>
                <dd className="font-medium capitalize text-foreground">
                  {(settings?.target_platform ?? "youtube_shorts").replace(/_/g, " ")}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Plan</dt>
                <dd className="font-medium text-foreground">{plan?.name ?? "Free"}</dd>
              </div>
            </dl>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/brand"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary-hover"
              >
                Edit brand kit
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
              </Link>
              <Link
                href="/settings"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary-hover"
              >
                All settings
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
              </Link>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-elevated p-5 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
              <KeyRound className="h-4 w-4 text-primary" strokeWidth={1.75} />
              API health
            </h2>
            <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>{connectedCount} of {CREDENTIAL_PROVIDERS.length} connected</span>
              <Link href="/api-management" className="text-primary hover:text-primary-hover">
                Manage
              </Link>
            </div>
            <div className="flex flex-wrap gap-2">
              {CREDENTIAL_PROVIDERS.map(({ provider, label }) => (
                <span
                  key={provider}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-foreground"
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: credentialDotColor(credentialByProvider.get(provider) ?? null) }}
                    aria-hidden="true"
                  />
                  {label}
                </span>
              ))}
            </div>
          </div>

          {latestPlan ? (
            <div className="rounded-xl border border-border bg-elevated p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">Monthly plan progress</h2>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {planApprovedCount}/{planTotalCount}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface">
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${planProgressPct}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {planProgressPct}% of {latestPlan.month ?? "this month"}&apos;s plan approved.
              </p>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-6 lg:col-span-2">
          <div>
            <h2 className="mb-4 text-sm font-semibold text-foreground">Quick actions</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {QUICK_LINKS.map((link) => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="group flex items-start gap-3 rounded-xl border border-border bg-elevated p-4 shadow-sm transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/30"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{link.label}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{link.description}</p>
                    </div>
                    <ArrowRight
                      className="ml-auto h-4 w-4 shrink-0 self-center text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                      strokeWidth={1.75}
                    />
                  </Link>
                );
              })}
            </div>
          </div>

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
              {videos.length === 0 ? (
                <EmptyState
                  icon={Clapperboard}
                  title="No videos yet"
                  description="Videos rendered by the pipeline will show up here."
                />
              ) : (
                <div className="flex flex-col divide-y divide-border">
                  {videos.map((video) => (
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
        </div>
      </div>
    </div>
  );
}
