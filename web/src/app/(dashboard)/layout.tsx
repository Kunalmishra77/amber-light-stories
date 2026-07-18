import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import {
  getCurrentTenantId,
  getMyMemberships,
  getProfile,
  getSessionUser,
} from "@/lib/auth";

// Every dashboard page reads Supabase per-request via the authed client, so
// the shell that resolves the current user/tenant must never be prerendered.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [user, profile, memberships, currentTenantId] = await Promise.all([
    getSessionUser(),
    getProfile(),
    getMyMemberships(),
    getCurrentTenantId(),
  ]);

  const tenantName =
    memberships.find((m) => m.tenant_id === currentTenantId)?.tenant_name ??
    memberships[0]?.tenant_name ??
    "No workspace";

  return (
    <div className="flex min-h-dvh w-full">
      <Sidebar />
      <div className="flex min-h-dvh flex-1 flex-col">
        <Topbar
          email={user?.email ?? ""}
          tenantName={tenantName}
          isSuperAdmin={profile?.is_super_admin ?? false}
        />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
