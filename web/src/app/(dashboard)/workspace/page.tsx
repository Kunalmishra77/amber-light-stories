import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Building2,
  Users,
  Wand2,
  Target,
  Activity,
  Paintbrush,
  Power,
  KeyRound,
  ArrowRight,
  Globe,
  Clock,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId, getMyMemberships } from "@/lib/auth";
import { getTenantBrand } from "@/lib/branding";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";

// Reads live rows from Supabase on every request — never prerender this.
export const dynamic = "force-dynamic";

interface TenantSettingsLite {
  industry: string | null;
  timezone: string | null;
  target_platform: string | null;
  config: Record<string, unknown> | null;
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
  { label: "Team", description: "Members & roles", href: "/team", icon: Users },
  { label: "Automation", description: "Master switch & emergency stop", href: "/automation", icon: Power },
  { label: "API Management", description: "Provider credentials", href: "/api-management", icon: KeyRound },
];

export default async function WorkspacePage() {
  const supabase = await createClient();
  const tenantId = (await getCurrentTenantId()) ?? "";

  const [{ data: tenant }, { data: settings }, memberships, brand, counts] = await Promise.all([
    supabase.from("tenants").select("name, slug, status, created_at").eq("id", tenantId).maybeSingle(),
    supabase
      .from("tenant_settings")
      .select("industry, timezone, target_platform, config")
      .eq("tenant_id", tenantId)
      .maybeSingle<TenantSettingsLite>(),
    getMyMemberships(),
    getTenantBrand(tenantId),
    Promise.all([
      supabase.from("stories").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId),
      supabase.from("videos").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId),
      supabase.from("memberships").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "active"),
    ]),
  ]);

  const [storiesCount, videosCount, memberCount] = counts.map((r) => r.count ?? 0);
  const currentMembership = memberships.find((m) => m.tenant_id === tenantId);
  const automationEnabled = Boolean((settings?.config as { automation_enabled?: boolean } | null)?.automation_enabled);

  return (
    <div>
      <PageHeader
        title="Workspace"
        description="A quick profile of this workspace, plus shortcuts to everything you manage day to day."
      />

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Stories" value={storiesCount} icon={Building2} />
        <StatCard label="Videos" value={videosCount} icon={Activity} />
        <StatCard label="Team members" value={memberCount} icon={Users} />
        <StatCard
          label="Automation"
          value={automationEnabled ? "On" : "Off"}
          icon={Power}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-elevated p-5 shadow-sm lg:col-span-1">
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
              <dt className="text-muted-foreground">Slug</dt>
              <dd className="font-medium text-foreground">{tenant?.slug ?? "—"}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="flex items-center gap-1.5 text-muted-foreground">
                <Globe className="h-3.5 w-3.5" strokeWidth={1.75} /> Industry
              </dt>
              <dd className="font-medium text-foreground">{settings?.industry ?? "Not set"}</dd>
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
          </dl>
          <Link
            href="/brand"
            className="mt-5 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary-hover"
          >
            Edit brand kit
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
          </Link>
        </div>

        <div className="lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Quick links</h2>
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
      </div>
    </div>
  );
}
