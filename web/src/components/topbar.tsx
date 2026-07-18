import { User, Wallet } from "lucide-react";
import { MobileNav } from "@/components/mobile-nav";
import { ThemeToggle } from "@/components/theme-toggle";

export function Topbar() {
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-border bg-surface/80 px-4 backdrop-blur-md sm:px-6">
      <div className="flex items-center gap-3">
        <MobileNav />
        <span className="inline-flex items-center rounded-full border border-border bg-elevated px-3 py-1 text-xs font-medium text-foreground">
          Amber Light Stories
        </span>
      </div>

      <div className="flex items-center gap-2.5 sm:gap-3">
        <div className="hidden items-center gap-1.5 rounded-full border border-border bg-elevated px-3 py-1.5 text-xs font-medium text-muted-foreground sm:inline-flex">
          <Wallet className="h-3.5 w-3.5 text-primary" strokeWidth={1.75} />
          <span className="tabular-nums text-foreground">$0.00</span>
          <span>credits used</span>
        </div>

        <ThemeToggle />

        <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-elevated text-muted-foreground">
          <User className="h-4 w-4" strokeWidth={1.75} />
        </div>
      </div>
    </header>
  );
}
