import { LogOut, ShieldCheck, User } from "lucide-react";
import Link from "next/link";
import { MobileNav } from "@/components/mobile-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell, type BellNotification } from "@/components/notification-bell";
import { CommandPalette } from "@/components/command-palette";
import { signOutAction } from "@/lib/actions/auth";

interface TopbarProps {
  email: string;
  tenantName: string;
  isSuperAdmin: boolean;
  notifications?: BellNotification[];
  brandName?: string;
  brandTagline?: string | null;
}

export function Topbar({
  email,
  tenantName,
  isSuperAdmin,
  notifications = [],
  brandName,
  brandTagline,
}: TopbarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-border bg-surface/80 px-4 backdrop-blur-md sm:px-6">
      <div className="flex items-center gap-3">
        <MobileNav
          isSuperAdmin={isSuperAdmin}
          brandName={brandName}
          brandTagline={brandTagline}
        />
        <span className="inline-flex items-center rounded-full border border-border bg-elevated px-3 py-1 text-xs font-medium text-foreground">
          {tenantName}
        </span>
        {isSuperAdmin ? (
          <Link
            href="/admin"
            className="hidden items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/15 sm:inline-flex"
          >
            <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.75} />
            SUPER ADMIN
          </Link>
        ) : null}
      </div>

      <div className="flex items-center gap-2.5 sm:gap-3">
        <CommandPalette isSuperAdmin={isSuperAdmin} />
        <NotificationBell notifications={notifications} />
        <ThemeToggle />

        <div className="hidden items-center gap-2 rounded-full border border-border bg-elevated py-1 pl-1 pr-3 sm:flex">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
            <User className="h-3.5 w-3.5" strokeWidth={1.75} />
          </span>
          <span className="max-w-[160px] truncate text-xs font-medium text-foreground">
            {email}
          </span>
        </div>

        <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-elevated text-muted-foreground sm:hidden">
          <User className="h-4 w-4" strokeWidth={1.75} />
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
  );
}
