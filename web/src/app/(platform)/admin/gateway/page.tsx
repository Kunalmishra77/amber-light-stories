import { Cpu, Layers, HeartPulse, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import { PROVIDER_REGISTRY } from "@/lib/providers/registry";
import { aiProviders, getProviderCapabilities, allCapabilities } from "@/lib/ai-gateway/capabilities";
import { cn } from "@/lib/utils";

// AI Gateway oversight — central routing, capabilities, health, cost.
export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  healthy: "text-[var(--status-approved)]",
  degraded: "text-[var(--status-paused)]",
  down: "text-[var(--status-failed)]",
  unknown: "text-muted-foreground",
};

function fmt(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

interface HealthRow {
  provider: string;
  status: string;
  consecutive_failures: number;
  last_ok_at: string | null;
  last_error_at: string | null;
  last_error: string | null;
}

async function load() {
  const supabase = await createClient();
  const [healthRes, usageRes, routingRes] = await Promise.all([
    supabase
      .from("provider_health")
      .select("provider, status, consecutive_failures, last_ok_at, last_error_at, last_error")
      .is("tenant_id", null),
    supabase.from("api_usage").select("provider, cost_usd").like("endpoint", "gateway:%"),
    supabase.from("settings").select("value").eq("kind", "model_routing").is("tenant_id", null).maybeSingle(),
  ]);

  const health = new Map<string, HealthRow>();
  for (const h of (healthRes.data ?? []) as HealthRow[]) health.set(h.provider, h);

  const cost = new Map<string, number>();
  for (const u of (usageRes.data ?? []) as { provider: string | null; cost_usd: number | null }[]) {
    if (!u.provider) continue;
    cost.set(u.provider, (cost.get(u.provider) ?? 0) + (u.cost_usd ?? 0));
  }

  return { health, cost, hasRouting: Boolean(routingRes.data) };
}

export default async function AdminGatewayPage() {
  let data: Awaited<ReturnType<typeof load>> | null = null;
  let errored = false;
  try {
    data = await load();
  } catch {
    errored = true;
  }

  const providers = aiProviders();
  const capabilities = allCapabilities();
  const totalCost = data ? Array.from(data.cost.values()).reduce((a, b) => a + b, 0) : 0;
  const healthyCount = data
    ? providers.filter((p) => (data!.health.get(p)?.status ?? "unknown") === "healthy").length
    : 0;

  return (
    <div>
      <PageHeader
        title="AI Gateway"
        description="Unified provider routing, capability discovery, health, and cost for every AI operation. Routing is centralized through the gateway (registry + per-tenant credential seam); live paid execution is a gated extension point."
      />

      {errored || !data ? (
        <EmptyState icon={Cpu} title="Couldn't load gateway data" />
      ) : (
        <div className="flex flex-col gap-8">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="AI providers" value={providers.length} icon={Cpu} />
            <StatCard label="Capabilities" value={capabilities.length} icon={Layers} />
            <StatCard label="Healthy" value={`${healthyCount}/${providers.length}`} icon={HeartPulse} />
            <StatCard label="Gateway cost" value={`$${totalCost.toFixed(2)}`} icon={Wallet} />
          </div>

          <section className="overflow-hidden rounded-xl border border-border bg-elevated">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="text-sm font-semibold text-foreground">Providers</span>
              <span className="text-xs text-muted-foreground">
                Routing config: {data.hasRouting ? "custom (global)" : "registry defaults"}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                    <th className="px-4 py-3">Provider</th>
                    <th className="px-4 py-3">Capabilities</th>
                    <th className="px-4 py-3">Health</th>
                    <th className="px-4 py-3 text-right">Fails</th>
                    <th className="px-4 py-3">Last OK</th>
                    <th className="px-4 py-3">Last error</th>
                    <th className="px-4 py-3 text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {providers.map((p) => {
                    const h = data!.health.get(p);
                    const status = h?.status ?? "unknown";
                    return (
                      <tr key={p} className="border-b border-border/60 last:border-0">
                        <td className="px-4 py-3 text-foreground">{PROVIDER_REGISTRY[p].label}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {getProviderCapabilities(p).map((c) => (
                              <span
                                key={c}
                                className="rounded-full border border-border bg-surface px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
                              >
                                {c}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className={cn("px-4 py-3 text-xs font-medium capitalize", STATUS_STYLE[status])}>
                          {status}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                          {h?.consecutive_failures ?? 0}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{fmt(h?.last_ok_at ?? null)}</td>
                        <td className="max-w-[220px] truncate px-4 py-3 text-xs text-[var(--status-failed)]">
                          {h?.last_error ?? ""}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                          ${(data!.cost.get(p) ?? 0).toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
