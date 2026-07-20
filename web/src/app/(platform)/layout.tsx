import { notFound } from "next/navigation";
import { LogOut, User } from "lucide-react";
import { PlatformSidebar } from "@/components/platform-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { getMyMemberships, getProfile, getSessionUser } from "@/lib/auth";
import { getPlatformSettings } from "@/lib/branding";
import { signOutAction } from "@/lib/actions/auth";

// The platform console reads live, cross-tenant data per request — never
// prerender.
export const dynamic = "force-dynamic";

/**
 * Platform console shell — the SECOND, fully separate shell (Bible Part 2 /
 * ADR-001). It renders the PLATFORM brand and platform-only navigation, and
 * never the client workspace chrome. Hard-gated to super admins: everyone
 * else gets a 404 so the console's existence isn't disclosed. (Every admin
 * server action ALSO re-verifies via `requireSuperAdmin()` — a layout guard
 * alone is not sufficient.)
 *
 * A platform operator does NOT need any tenant membership to be here — the
 * console is independent of the workspace shell. Entering a specific client
 * workspace is a deliberate, audited action (impersonation), not an implicit
 * side effect of membership.
 */
export default async function PlatformLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [profile, user, memberships, platform] = await Promise.all([
    getProfile(),
    getSessionUser(),
    getMyMemberships(),
    getPlatformSettings(),
  ]);

  if (!profile?.is_super_admin) {
    notFound();
  }

  return (
    <div className="flex min-h-dvh w-full">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[200] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-on-primary focus:shadow-lg"
      >
        Skip to main content
      </a>
      <PlatformSidebar
        platformName={platform.platform_name}
        hasWorkspace={memberships.length > 0}
      />
      <div className="flex min-h-dvh flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-border bg-surface/80 px-4 backdrop-blur-md sm:px-6">
          <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            {platform.platform_name} · Platform
          </span>
          <div className="flex items-center gap-2.5 sm:gap-3">
            <ThemeToggle />
            <div className="hidden items-center gap-2 rounded-full border border-border bg-elevated py-1 pl-1 pr-3 sm:flex">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                <User className="h-3.5 w-3.5" strokeWidth={1.75} />
              </span>
              <span className="max-w-[160px] truncate text-xs font-medium text-foreground">
                {user?.email ?? ""}
              </span>
            </div>
            <form action={signOutAction}>
              <button
                type="submit"
                aria-label="Sign out"
                title="Sign out"
                className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-border bg-elevated text-muted-foreground transition-colors duration-200 ease-out hover:border-[var(--status-failed)]/40 hover:text-[var(--status-failed)]"
              >
                <LogOut className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </button>
            </form>
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 px-4 py-6 outline-none sm:px-6 lg:px-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
