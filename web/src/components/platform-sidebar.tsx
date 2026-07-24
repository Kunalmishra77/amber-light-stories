"use client";

import * as React from "react";
import Link from "next/link";
import { ShieldCheck, ChevronsLeft, ChevronsRight, ArrowLeft } from "lucide-react";
import { NavList } from "@/components/nav-list";
import { adminNavGroup } from "@/lib/nav";
import { cn } from "@/lib/utils";

interface PlatformSidebarProps {
  /** PLATFORM brand (the SaaS product's own name) — never a client brand.
   * This is the platform console shell, fully separate from any tenant
   * workspace (Bible Part 2 / ADR-001). */
  platformName?: string;
  /** When true, the operator also belongs to a workspace and can return to
   * it; otherwise the platform console is their only surface. */
  hasWorkspace?: boolean;
}

/**
 * The platform console sidebar. Distinct from the client `Sidebar`: it shows
 * the PLATFORM brand and ONLY platform/admin navigation. A client's brand
 * or workspace nav never appears here.
 */
export function PlatformSidebar({
  platformName = "YT Automation",
  hasWorkspace = false,
}: PlatformSidebarProps) {
  const [collapsed, setCollapsed] = React.useState(false);

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-sidebar/80 backdrop-blur-md transition-[width] duration-200 ease-out md:flex",
        collapsed ? "w-[76px]" : "w-64"
      )}
    >
      {/* Platform brand — signals this is the platform console, not a client
          workspace. */}
      <div className="flex h-16 items-center gap-2.5 border-b border-border px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ShieldCheck className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </div>
        {!collapsed && (
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-semibold tracking-tight text-foreground">
              {platformName}
            </span>
            <span className="truncate text-[10px] font-medium tracking-[0.18em] text-muted-foreground">
              PLATFORM CONSOLE
            </span>
          </div>
        )}
      </div>

      <NavList collapsed={collapsed} groups={[adminNavGroup]} />

      {/* Return to the operator's own workspace, if they have one. */}
      {hasWorkspace && (
        <div className="px-3 pb-1 pt-2">
          <Link
            href="/"
            title={collapsed ? "Exit to workspace" : undefined}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors duration-200 ease-out hover:bg-elevated hover:text-foreground"
          >
            <ArrowLeft className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
            {!collapsed && <span className="truncate">Exit to workspace</span>}
          </Link>
        </div>
      )}

      {/* Collapse toggle */}
      <div className="border-t border-border p-3">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors duration-200 ease-out hover:bg-elevated hover:text-foreground"
        >
          {collapsed ? (
            <ChevronsRight className="h-[18px] w-[18px]" strokeWidth={1.75} />
          ) : (
            <>
              <ChevronsLeft className="h-[18px] w-[18px]" strokeWidth={1.75} />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
