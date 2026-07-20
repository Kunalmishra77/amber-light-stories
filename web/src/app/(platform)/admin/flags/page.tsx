import { Flag, Globe, Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { FlagToggle } from "./flag-toggle";
import { CreateFlagForm } from "./create-flag-form";

// Cross-tenant feature flag list — reads live on every request.
export const dynamic = "force-dynamic";

interface FlagRow {
  id: string;
  tenant_id: string | null;
  key: string;
  enabled: boolean;
  config: Record<string, unknown> | null;
}

interface TenantOption {
  id: string;
  name: string;
}

async function loadFlags() {
  const supabase = await createClient();

  const [flagsRes, tenantsRes] = await Promise.all([
    supabase
      .from("feature_flags")
      .select("id, tenant_id, key, enabled, config")
      .order("key", { ascending: true }),
    supabase.from("tenants").select("id, name").order("name", { ascending: true }),
  ]);

  if (flagsRes.error) throw flagsRes.error;

  const tenants = (tenantsRes.data ?? []) as TenantOption[];
  const tenantNames = new Map(tenants.map((t) => [t.id, t.name]));

  return {
    flags: (flagsRes.data ?? []) as FlagRow[],
    tenants,
    tenantNames,
  };
}

export default async function AdminFlagsPage() {
  let data: Awaited<ReturnType<typeof loadFlags>> | null = null;
  let errored = false;

  try {
    data = await loadFlags();
  } catch {
    errored = true;
  }

  return (
    <div>
      <PageHeader
        title="Feature Flags"
        description="Global flags apply to every tenant unless overridden by a tenant-scoped flag with the same key."
      />

      <div className="mb-8">
        <CreateFlagForm tenants={data?.tenants ?? []} />
      </div>

      {errored || !data ? (
        <EmptyState
          icon={Flag}
          title="Couldn't load feature flags"
          description="There was a problem reaching Supabase. Check the connection."
        />
      ) : data.flags.length === 0 ? (
        <EmptyState icon={Flag} title="No feature flags yet" description="Add one above." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-elevated shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-3">Key</th>
                  <th className="px-5 py-3">Scope</th>
                  <th className="px-5 py-3">Enabled</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.flags.map((flag) => (
                  <tr key={flag.id}>
                    <td className="px-5 py-3 font-mono text-xs text-foreground">{flag.key}</td>
                    <td className="px-5 py-3">
                      {flag.tenant_id ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Building2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                          {data!.tenantNames.get(flag.tenant_id) ?? flag.tenant_id}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs text-primary">
                          <Globe className="h-3.5 w-3.5" strokeWidth={1.75} />
                          Global
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <FlagToggle flagId={flag.id} enabled={flag.enabled} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
