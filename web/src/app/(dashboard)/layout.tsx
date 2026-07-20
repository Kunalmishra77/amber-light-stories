import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { AnnouncementsBanner, type AnnouncementData } from "@/components/announcements-banner";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentTenantId,
  getMyMemberships,
  getProfile,
  getSessionUser,
} from "@/lib/auth";
import { getPlatformSettings, getTenantBrand } from "@/lib/branding";

// Every dashboard page reads Supabase per-request via the authed client, so
// the shell that resolves the current user/tenant must never be prerendered.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [user, profile, memberships, currentTenantId, platform] = await Promise.all([
    getSessionUser(),
    getProfile(),
    getMyMemberships(),
    getCurrentTenantId(),
    getPlatformSettings(),
  ]);

  const tenantName =
    memberships.find((m) => m.tenant_id === currentTenantId)?.tenant_name ??
    memberships[0]?.tenant_name ??
    "No workspace";

  // CLIENT brand (this tenant's own name/tagline) — distinct from
  // `platform` above, which is the SaaS product's own brand. Sidebar/topbar
  // show the client brand; /login and /admin show the platform brand.
  const brand = await getTenantBrand(currentTenantId);

  let notifications: Awaited<ReturnType<typeof loadTopbarNotifications>> = [];
  let announcement: AnnouncementData | null = null;
  if (currentTenantId) {
    [notifications, announcement] = await Promise.all([
      loadTopbarNotifications(currentTenantId),
      loadLatestAnnouncement(),
    ]);
  }

  return (
    <div className="flex min-h-dvh w-full">
      {/* Visible only when focused (e.g. first Tab press) — lets keyboard
          users jump straight past the sidebar/topbar into the page content. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[200] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-on-primary focus:shadow-lg"
      >
        Skip to main content
      </a>
      <Sidebar
        brandName={brand.display_name || tenantName}
        brandTagline={brand.tagline}
        platformName={platform.platform_name}
      />
      <div className="flex min-h-dvh flex-1 flex-col">
        <Topbar
          email={user?.email ?? ""}
          tenantName={tenantName}
          isSuperAdmin={profile?.is_super_admin ?? false}
          notifications={notifications}
          brandName={brand.display_name || tenantName}
          brandTagline={brand.tagline}
        />
        <main id="main-content" tabIndex={-1} className="flex-1 px-4 py-6 outline-none sm:px-6 lg:px-8">
          <AnnouncementsBanner announcement={announcement} />
          {children}
        </main>
      </div>
    </div>
  );
}

/** Recent notifications for the topbar bell — best-effort, never throws. */
async function loadTopbarNotifications(tenantId: string) {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("notifications")
      .select("id, kind, title, body, read, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(20);
    return data ?? [];
  } catch {
    return [];
  }
}

/** Latest active announcement targeted at tenants ('all' or 'tenants'
 * audience — 'internal' is platform-team-only, never shown here).
 * Best-effort, never throws. */
async function loadLatestAnnouncement(): Promise<AnnouncementData | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("announcements")
      .select("id, title, body")
      .eq("active", true)
      .in("audience", ["all", "tenants"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<AnnouncementData>();
    return data ?? null;
  } catch {
    return null;
  }
}
