import { Boxes, CheckCircle2, GitBranch, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";

/**
 * Asset Library governance surface (M12 G1 — ADR-041/049). Shows every
 * first-class versioned asset the workspace owns, which version is ACTIVE,
 * its governance state, and whether it was adopted from another asset
 * (copy-on-use provenance).
 */
export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  prompt_template: "Prompt template",
  character: "Character",
  style_pack: "Style pack",
  brand_voice: "Brand voice",
  voice_profile: "Voice profile",
};

const STATE_STYLE: Record<string, string> = {
  draft: "text-muted-foreground",
  in_review: "text-[var(--status-paused)]",
  approved: "text-[var(--status-approved)]",
  archived: "text-muted-foreground",
};

export default async function AssetLibraryPage() {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) {
    return (
      <div>
        <PageHeader title="Asset Library" description="Versioned, governed workspace assets." />
        <EmptyState icon={Boxes} title="Join a workspace to see its asset library" />
      </div>
    );
  }

  const supabase = await createClient();
  const [itemsRes, versionsRes] = await Promise.all([
    supabase
      .from("asset_library_items")
      .select("id, kind, key, name, description, active_version_id, governance_state, origin_item_id, tags, updated_at")
      .eq("tenant_id", tenantId)
      .order("kind", { ascending: true })
      .order("name", { ascending: true }),
    supabase.from("asset_versions").select("id, item_id, version, state, immutable").eq("tenant_id", tenantId),
  ]);

  const items = (itemsRes.data ?? []) as Array<{
    id: string; kind: string; key: string; name: string; description: string | null;
    active_version_id: string | null; governance_state: string; origin_item_id: string | null; tags: string[];
  }>;
  const versions = (versionsRes.data ?? []) as Array<{ id: string; item_id: string; version: number; state: string; immutable: boolean }>;

  const versionsByItem = new Map<string, typeof versions>();
  for (const v of versions) {
    const list = versionsByItem.get(v.item_id) ?? [];
    list.push(v);
    versionsByItem.set(v.item_id, list);
  }

  const activeCount = items.filter((i) => i.active_version_id).length;
  const immutableCount = versions.filter((v) => v.immutable).length;
  const adoptedCount = items.filter((i) => i.origin_item_id).length;

  return (
    <div>
      <PageHeader
        title="Asset Library"
        description="Prompt templates, characters, style packs, brand voices and voice profiles as first-class versioned assets. Approved versions are immutable, and exactly one version is active per asset."
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Assets" value={items.length} icon={Boxes} />
        <StatCard label="With active version" value={activeCount} icon={CheckCircle2} />
        <StatCard label="Immutable versions" value={immutableCount} icon={ShieldCheck} />
        <StatCard label="Adopted (copy-on-use)" value={adoptedCount} icon={GitBranch} />
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="No governed assets yet"
          description="Characters, voices, prompt templates and style packs added here are versioned and approved before use."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-elevated shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                  <th className="px-4 py-3">Asset</th>
                  <th className="px-4 py-3">Kind</th>
                  <th className="px-4 py-3">Governance</th>
                  <th className="px-4 py-3 text-right">Versions</th>
                  <th className="px-4 py-3 text-right">Active</th>
                  <th className="px-4 py-3">Provenance</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const vs = versionsByItem.get(item.id) ?? [];
                  const active = vs.find((v) => v.id === item.active_version_id);
                  return (
                    <tr key={item.id} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="text-foreground">{item.name}</span>
                          <code className="font-mono text-[11px] text-muted-foreground">{item.key}</code>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{KIND_LABEL[item.kind] ?? item.kind}</td>
                      <td className="px-4 py-3">
                        <span className={cn("text-xs font-medium capitalize", STATE_STYLE[item.governance_state] ?? "")}>
                          {item.governance_state.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{vs.length}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {active ? (
                          <span className="inline-flex items-center gap-1">
                            v{active.version}
                            {active.immutable ? <ShieldCheck className="h-3 w-3 text-[var(--status-approved)]" /> : null}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {item.origin_item_id ? "Adopted (copy-on-use)" : "Original"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
