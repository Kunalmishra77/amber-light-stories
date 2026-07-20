import { KeyRound, Webhook, Radio, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";

// Cross-tenant API & webhook oversight (read-only) — live on every request.
export const dynamic = "force-dynamic";

function fmt(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

interface KeyRow {
  id: string;
  tenant_id: string | null;
  name: string;
  prefix: string;
  scopes: string[];
  last_used_at: string | null;
  revoked_at: string | null;
}
interface EndpointRow {
  id: string;
  tenant_id: string | null;
  url: string;
  event_types: string[];
  enabled: boolean;
}
interface DeliveryRow {
  id: string;
  tenant_id: string | null;
  event_type: string;
  status: string;
  status_code: number | null;
  created_at: string;
}

async function load() {
  const supabase = await createClient();
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();

  const [keysRes, endpointsRes, deliveriesRes, activeKeysRes, deliveries24Res, tenantsRes] = await Promise.all([
    supabase
      .from("api_keys")
      .select("id, tenant_id, name, prefix, scopes, last_used_at, revoked_at")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("webhook_endpoints")
      .select("id, tenant_id, url, event_types, enabled")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("webhook_deliveries")
      .select("id, tenant_id, event_type, status, status_code, created_at")
      .order("created_at", { ascending: false })
      .limit(25),
    supabase.from("api_keys").select("*", { count: "exact", head: true }).is("revoked_at", null),
    supabase.from("webhook_deliveries").select("*", { count: "exact", head: true }).gte("created_at", dayAgo),
    supabase.from("tenants").select("id, name"),
  ]);

  if (keysRes.error) throw keysRes.error;

  const tenantNames = new Map(
    ((tenantsRes.data ?? []) as { id: string; name: string }[]).map((t) => [t.id, t.name])
  );

  return {
    keys: (keysRes.data ?? []) as KeyRow[],
    endpoints: (endpointsRes.data ?? []) as EndpointRow[],
    deliveries: (deliveriesRes.data ?? []) as DeliveryRow[],
    activeKeys: activeKeysRes.count ?? 0,
    deliveries24: deliveries24Res.count ?? 0,
    tenantNames,
  };
}

export default async function AdminApiPage() {
  let data: Awaited<ReturnType<typeof load>> | null = null;
  let errored = false;
  try {
    data = await load();
  } catch {
    errored = true;
  }

  const tname = (id: string | null) => (id ? data?.tenantNames.get(id) ?? "—" : "—");

  return (
    <div>
      <PageHeader
        title="API & Webhooks"
        description="Cross-tenant oversight of public API keys and webhook endpoints (read-only). Keys are issued and rotated by tenants in their own workspace; secrets are never stored in the clear."
      />

      {errored || !data ? (
        <EmptyState icon={ShieldCheck} title="Couldn't load API data" />
      ) : (
        <div className="flex flex-col gap-8">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="API keys" value={data.keys.length} icon={KeyRound} />
            <StatCard label="Active keys" value={data.activeKeys} icon={ShieldCheck} />
            <StatCard label="Webhook endpoints" value={data.endpoints.length} icon={Webhook} />
            <StatCard label="Deliveries (24h)" value={data.deliveries24} icon={Radio} />
          </div>

          <section className="overflow-hidden rounded-xl border border-border bg-elevated">
            <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">API keys</div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                    <th className="px-4 py-3">Tenant</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Prefix</th>
                    <th className="px-4 py-3">Scopes</th>
                    <th className="px-4 py-3">Last used</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.keys.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-xs text-muted-foreground">
                        No API keys issued yet.
                      </td>
                    </tr>
                  ) : (
                    data.keys.map((k) => (
                      <tr key={k.id} className="border-b border-border/60 last:border-0">
                        <td className="px-4 py-3 text-foreground">{tname(k.tenant_id)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{k.name}</td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{k.prefix}…</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{k.scopes.join(", ")}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{fmt(k.last_used_at)}</td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "text-xs font-medium",
                              k.revoked_at ? "text-[var(--status-failed)]" : "text-[var(--status-approved)]"
                            )}
                          >
                            {k.revoked_at ? "Revoked" : "Active"}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-border bg-elevated">
            <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
              Webhook endpoints
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                    <th className="px-4 py-3">Tenant</th>
                    <th className="px-4 py-3">URL</th>
                    <th className="px-4 py-3">Events</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.endpoints.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-xs text-muted-foreground">
                        No webhook endpoints registered yet.
                      </td>
                    </tr>
                  ) : (
                    data.endpoints.map((e) => (
                      <tr key={e.id} className="border-b border-border/60 last:border-0">
                        <td className="px-4 py-3 text-foreground">{tname(e.tenant_id)}</td>
                        <td className="max-w-[280px] truncate px-4 py-3 font-mono text-xs text-muted-foreground">
                          {e.url}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{e.event_types.join(", ")}</td>
                        <td className="px-4 py-3 text-xs font-medium text-muted-foreground">
                          {e.enabled ? "Enabled" : "Disabled"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
