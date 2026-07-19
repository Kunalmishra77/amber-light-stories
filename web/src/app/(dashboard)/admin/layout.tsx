import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { getProfile } from "@/lib/auth";
import { getPlatformSettings } from "@/lib/branding";

// Every /admin page reads live, cross-tenant data — never prerender.
export const dynamic = "force-dynamic";

/**
 * Hard gate for the entire /admin tree. Non-super-admins get a 404 (not a
 * redirect) so the portal's existence isn't even disclosed. Every admin
 * server action ALSO re-verifies via `requireSuperAdmin()` — this layout
 * check alone is not sufficient, since server actions are directly
 * callable and don't re-run route layouts.
 */
export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const profile = await getProfile();
  if (!profile?.is_super_admin) {
    notFound();
  }

  // The PLATFORM brand (not the current tenant's client brand) — makes it
  // unmistakable that /admin is platform-level, not tenant workspace.
  const platform = await getPlatformSettings();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2.5 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
        <ShieldCheck className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.75} />
        <span className="text-sm font-semibold text-foreground">
          {platform.platform_name} · Admin
        </span>
        <span className="hidden text-xs text-muted-foreground sm:inline">
          Platform-level settings — not scoped to a single client.
        </span>
      </div>
      {children}
    </div>
  );
}
