import {
  CreditCard,
  Coins,
  Wallet,
  Clapperboard,
  Cpu,
  HardDrive,
  CheckCircle2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import { formatUsd } from "@/lib/cost";
import { rollupUsage } from "@/lib/ops/usage";
import { UpgradeButton } from "./upgrade-button";

// Reads live rows from Supabase on every request — never prerender this.
export const dynamic = "force-dynamic";

interface PlanRow {
  id: string;
  name: string;
  slug: string | null;
  price_month: number | null;
  limits: Record<string, number | string> | null;
  features: Record<string, unknown> | null;
  active: boolean | null;
  sort: number | null;
}

interface SubscriptionRow {
  id: string;
  status: string | null;
  current_period_end: string | null;
  plan: PlanRow | PlanRow[] | null;
}

const LIMIT_LABELS: Record<string, string> = {
  videos_month: "Videos / month",
  ai_credits: "AI credits / month",
};

function limitLabel(key: string): string {
  return LIMIT_LABELS[key] ?? key.replace(/_/g, " ");
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 MB";
  const mb = bytes / 1_000_000;
  if (mb < 1000) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1000).toFixed(2)} GB`;
}

export default async function BillingPage() {
  const supabase = await createClient();
  const tenantId = (await getCurrentTenantId()) ?? "";

  let subscription: SubscriptionRow | null = null;
  let creditsBalance = 0;
  let plans: PlanRow[] = [];
  let errored = false;

  try {
    const [subRes, ledgerRes, plansRes] = await Promise.all([
      supabase
        .from("subscriptions")
        .select(
          "id, status, current_period_end, plan:plans(id, name, slug, price_month, limits, features, active, sort)"
        )
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<SubscriptionRow>(),
      supabase
        .from("credit_ledger")
        .select("balance_after")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ balance_after: number | null }>(),
      supabase
        .from("plans")
        .select("id, name, slug, price_month, limits, features, active, sort")
        .eq("active", true)
        .order("sort", { ascending: true }),
    ]);
    if (subRes.error) throw subRes.error;
    if (plansRes.error) throw plansRes.error;

    subscription = subRes.data ?? null;
    creditsBalance = ledgerRes.data?.balance_after ?? 0;
    plans = (plansRes.data ?? []) as PlanRow[];
  } catch {
    errored = true;
  }

  const usage = await rollupUsage(tenantId);

  const currentPlan = subscription
    ? Array.isArray(subscription.plan)
      ? (subscription.plan[0] ?? null)
      : subscription.plan
    : null;
  const fallbackPlan = plans.find((p) => p.slug === "free") ?? plans[0] ?? null;
  const displayPlan = currentPlan ?? fallbackPlan;

  if (errored) {
    return (
      <div>
        <PageHeader title="Billing" description="Plan, credits, and usage for your workspace." />
        <EmptyState
          icon={CreditCard}
          title="Couldn't load billing data"
          description="There was a problem reaching Supabase. Check your connection."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Billing" description="Plan, credits, and usage for your workspace." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Current plan"
          value={displayPlan ? displayPlan.name : "—"}
          icon={CreditCard}
        />
        <StatCard label="Credits balance" value={creditsBalance.toLocaleString()} icon={Coins} />
        <StatCard
          label="Spend this period"
          value={formatUsd(usage?.cost_usd ?? 0, 4)}
          icon={Wallet}
        />
        <StatCard
          label="Videos this period"
          value={usage?.videos ?? 0}
          icon={Clapperboard}
        />
      </div>

      {!subscription ? (
        <div className="mt-6 rounded-lg border border-[var(--status-pending)]/30 bg-[var(--status-pending)]/10 px-4 py-3 text-xs text-[var(--status-pending)]">
          No active subscription on file for this workspace — showing the Free plan by default.
        </div>
      ) : null}

      {/* Plan details + usage this period */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-elevated p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Plan details</h2>
          {displayPlan ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between">
                <span className="text-lg font-semibold text-foreground">{displayPlan.name}</span>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {formatUsd(displayPlan.price_month ?? 0, 0)}/mo
                </span>
              </div>
              {displayPlan.limits && Object.keys(displayPlan.limits).length > 0 ? (
                <ul className="flex flex-col gap-1.5">
                  {Object.entries(displayPlan.limits).map(([key, value]) => (
                    <li
                      key={key}
                      className="flex items-center justify-between text-xs text-muted-foreground"
                    >
                      <span>{limitLabel(key)}</span>
                      <span className="tabular-nums font-medium text-foreground">
                        {String(value)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {subscription?.current_period_end ? (
                <p className="text-xs text-muted-foreground">
                  Renews {new Date(subscription.current_period_end).toLocaleDateString()}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No plan catalog available yet.</p>
          )}
        </div>

        <div className="rounded-xl border border-border bg-elevated p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Usage this period</h2>
          <ul className="flex flex-col divide-y divide-border">
            <li className="flex items-center justify-between py-2.5 text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Clapperboard className="h-3.5 w-3.5" strokeWidth={1.75} />
                Videos
              </span>
              <span className="tabular-nums font-medium text-foreground">
                {usage?.videos ?? 0}
              </span>
            </li>
            <li className="flex items-center justify-between py-2.5 text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Cpu className="h-3.5 w-3.5" strokeWidth={1.75} />
                AI calls
              </span>
              <span className="tabular-nums font-medium text-foreground">
                {usage?.ai_calls ?? 0}
              </span>
            </li>
            <li className="flex items-center justify-between py-2.5 text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Wallet className="h-3.5 w-3.5" strokeWidth={1.75} />
                Cost
              </span>
              <span className="tabular-nums font-medium text-foreground">
                {formatUsd(usage?.cost_usd ?? 0, 4)}
              </span>
            </li>
            <li className="flex items-center justify-between py-2.5 text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <HardDrive className="h-3.5 w-3.5" strokeWidth={1.75} />
                Storage
              </span>
              <span className="tabular-nums font-medium text-foreground">
                {formatBytes(usage?.storage_bytes ?? 0)}
              </span>
            </li>
          </ul>
        </div>
      </div>

      {/* Plan comparison */}
      <div className="mt-8">
        <h2 className="mb-4 text-sm font-semibold text-foreground">Plans</h2>
        {plans.length === 0 ? (
          <EmptyState icon={CreditCard} title="No plans in the catalog yet" />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan) => {
              const isCurrent = displayPlan?.id === plan.id;
              return (
                <div
                  key={plan.id}
                  className="flex flex-col gap-4 rounded-xl border border-border bg-elevated p-5 shadow-sm"
                >
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-semibold text-foreground">{plan.name}</span>
                    <span className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
                      {formatUsd(plan.price_month ?? 0, 0)}
                      <span className="text-xs font-normal text-muted-foreground">/mo</span>
                    </span>
                  </div>
                  <ul className="flex flex-1 flex-col gap-1.5">
                    {plan.limits &&
                      Object.entries(plan.limits).map(([key, value]) => (
                        <li
                          key={key}
                          className="flex items-center gap-1.5 text-xs text-muted-foreground"
                        >
                          <CheckCircle2
                            className="h-3.5 w-3.5 shrink-0 text-primary"
                            strokeWidth={1.75}
                          />
                          {value} {limitLabel(key).toLowerCase()}
                        </li>
                      ))}
                  </ul>
                  {isCurrent ? (
                    <span className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-medium text-primary">
                      <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />
                      Current plan
                    </span>
                  ) : (
                    <UpgradeButton planName={plan.name} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
