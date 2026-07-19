import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, KeyRound, Users, Activity, AlertTriangle, BookOpen, Clapperboard, DollarSign } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getUserEmails } from "@/lib/admin/emails";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge, type PipelineStatus } from "@/components/status-badge";
import { formatUsd } from "@/lib/cost";
import { TenantStatusActions } from "../tenant-status-actions";
import { TenantSettingsForm, type TenantSettingsData } from "./tenant-settings-form";
import { BillingActions, type PlanOption } from "./billing-actions";
import { MemberUnlockButton } from "./member-unlock-button";

// Per-tenant admin detail — reads live on every request.
export const dynamic = "force-dynamic";

const TENANT_STATUS_BADGE: Record<string, PipelineStatus> = {
  active: "approved",
  pending: "pending",
  suspended: "paused",
  locked: "failed",
  deleted: "rejected",
};

interface TenantRow {
  id: string;
  name: string;
  slug: string | null;
  status: string;
  created_at: string;
  deleted_at: string | null;
}

interface MembershipRow {
  id: string;
  user_id: string;
  role: string | null;
  status: string | null;
}

interface ProfileLockRow {
  user_id: string;
  locked_until: string | null;
  failed_login_attempts: number | null;
}

interface SubscriptionRef {
  id: string;
  plan_id: string | null;
}

async function loadClient(id: string) {
  const supabase = await createClient();

  const [
    tenantRes,
    settingsRes,
    membershipsRes,
    storiesRes,
    videosRes,
    runsRes,
    jobsFailedRes,
    plansRes,
    subscriptionRes,
    creditLedgerRes,
  ] = await Promise.all([
      supabase
        .from("tenants")
        .select("id, name, slug, status, created_at, deleted_at")
        .eq("id", id)
        .maybeSingle<TenantRow>(),
      supabase
        .from("tenant_settings")
        .select("country, timezone, language, industry, per_video_budget_usd")
        .eq("tenant_id", id)
        .maybeSingle<TenantSettingsData>(),
      supabase
        .from("memberships")
        .select("id, user_id, role, status")
        .eq("tenant_id", id),
      supabase.from("stories").select("*", { count: "exact", head: true }).eq("tenant_id", id),
      supabase.from("videos").select("*", { count: "exact", head: true }).eq("tenant_id", id),
      supabase.from("pipeline_runs").select("status, budget_usd, total_cost_usd").eq("tenant_id", id),
      supabase
        .from("jobs")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", id)
        .eq("status", "failed"),
      supabase.from("plans").select("id, name").eq("active", true).order("sort", { ascending: true }),
      supabase
        .from("subscriptions")
        .select("id, plan_id")
        .eq("tenant_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<SubscriptionRef>(),
      supabase
        .from("credit_ledger")
        .select("balance_after")
        .eq("tenant_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ balance_after: number | null }>(),
    ]);

  if (tenantRes.error) throw tenantRes.error;
  const tenant = tenantRes.data;
  if (!tenant) return null;

  const memberships = (membershipsRes.data ?? []) as MembershipRow[];
  const memberUserIds = memberships.map((m) => m.user_id);
  const emails = await getUserEmails(memberUserIds);

  const lockByUserId = new Map<string, ProfileLockRow>();
  if (memberUserIds.length > 0) {
    const { data: lockRows } = await supabase
      .from("profiles")
      .select("user_id, locked_until, failed_login_attempts")
      .in("user_id", memberUserIds);
    for (const row of (lockRows ?? []) as ProfileLockRow[]) {
      lockByUserId.set(row.user_id, row);
    }
  }

  const runs = runsRes.data ?? [];
  const plannedCost = runs.reduce((sum, r) => sum + (Number(r.budget_usd) || 0), 0);
  const actualCost = runs.reduce((sum, r) => sum + (Number(r.total_cost_usd) || 0), 0);
  const runStatusCounts = new Map<string, number>();
  for (const r of runs) {
    const status = (r.status as string) ?? "unknown";
    runStatusCounts.set(status, (runStatusCounts.get(status) ?? 0) + 1);
  }

  return {
    tenant,
    settings: settingsRes.data ?? {
      country: null,
      timezone: null,
      language: null,
      industry: null,
      per_video_budget_usd: null,
    },
    memberships,
    emails,
    lockByUserId,
    storiesCount: storiesRes.count ?? 0,
    videosCount: videosRes.count ?? 0,
    plannedCost,
    actualCost,
    runStatusCounts,
    failedJobs: jobsFailedRes.count ?? 0,
    plans: (plansRes.data ?? []) as PlanOption[],
    currentPlanId: subscriptionRes.data?.plan_id ?? null,
    creditsBalance: creditLedgerRes.data?.balance_after ?? 0,
  };
}

export default async function AdminClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await loadClient(id);
  if (!data) notFound();

  const {
    tenant,
    settings,
    memberships,
    emails,
    lockByUserId,
    storiesCount,
    videosCount,
    plannedCost,
    actualCost,
    runStatusCounts,
    failedJobs,
    plans,
    currentPlanId,
    creditsBalance,
  } = data;

  return (
    <div>
      <Link
        href="/admin/clients"
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
        Back to clients
      </Link>

      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title={tenant.name}
          description={`Slug: ${tenant.slug ?? "—"} · Created ${new Date(tenant.created_at).toLocaleDateString()}`}
        />
        <div className="flex items-center gap-3">
          <StatusBadge status={TENANT_STATUS_BADGE[tenant.status] ?? tenant.status} />
        </div>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Stories" value={storiesCount} icon={BookOpen} />
        <StatCard label="Videos" value={videosCount} icon={Clapperboard} />
        <StatCard label="Planned cost" value={formatUsd(plannedCost)} icon={DollarSign} />
        <StatCard
          label="Failed jobs"
          value={failedJobs}
          icon={AlertTriangle}
          error={failedJobs > 0}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <TenantSettingsForm tenantId={tenant.id} settings={settings} />

          <BillingActions
            tenantId={tenant.id}
            plans={plans}
            currentPlanId={currentPlanId}
            creditsBalance={creditsBalance}
          />

          <div className="rounded-xl border border-border bg-elevated p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-foreground">Status actions</h2>
            <TenantStatusActions tenantId={tenant.id} status={tenant.status} />
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-border bg-elevated p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-foreground">Credentials</h2>
            <button
              type="button"
              disabled
              className="inline-flex w-fit cursor-not-allowed items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-muted-foreground opacity-60"
            >
              <KeyRound className="h-3.5 w-3.5" strokeWidth={2} />
              Reset API keys
            </button>
            <p className="text-xs text-muted-foreground">Credential vault lands in S3.</p>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="rounded-xl border border-border bg-elevated shadow-sm">
            <div className="flex items-center gap-2 border-b border-border px-5 py-4">
              <Users className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
              <h2 className="text-sm font-semibold text-foreground">
                Members ({memberships.length})
              </h2>
            </div>
            {memberships.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">No members yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {memberships.map((m) => {
                  const lock = lockByUserId.get(m.user_id);
                  const isLocked = Boolean(lock?.locked_until && new Date(lock.locked_until) > new Date());
                  return (
                    <li key={m.id} className="flex flex-col gap-1.5 px-5 py-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-foreground">
                          {emails.get(m.user_id) ?? m.user_id}
                        </span>
                        <span className="shrink-0 rounded-full border border-border bg-surface px-2 py-0.5 text-xs text-muted-foreground">
                          {m.role ?? "—"}
                        </span>
                      </div>
                      {isLocked ? (
                        <div className="flex items-center justify-between gap-3">
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--status-failed)]">
                            <AlertTriangle className="h-3 w-3" strokeWidth={2} />
                            Locked until {new Date(lock!.locked_until!).toLocaleTimeString()}
                          </span>
                          <MemberUnlockButton tenantId={tenant.id} userId={m.user_id} />
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-border bg-elevated shadow-sm">
            <div className="flex items-center gap-2 border-b border-border px-5 py-4">
              <Activity className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
              <h2 className="text-sm font-semibold text-foreground">Pipeline health</h2>
            </div>
            {runStatusCounts.size === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">No pipeline runs yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {Array.from(runStatusCounts.entries()).map(([status, count]) => (
                  <li key={status} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <StatusBadge status={status} />
                    <span className="tabular-nums font-medium text-foreground">{count}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3 text-xs text-muted-foreground">
              <span>Actual spend so far</span>
              <span className="tabular-nums font-medium text-foreground">{formatUsd(actualCost)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
