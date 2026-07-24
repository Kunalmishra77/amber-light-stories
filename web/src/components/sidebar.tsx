"use client";

import * as React from "react";
import { Clapperboard, ChevronsLeft, ChevronsRight } from "lucide-react";
import { NavList } from "@/components/nav-list";
import { cn } from "@/lib/utils";

interface SidebarProps {
  /** CLIENT brand — the current tenant's display name, never the platform
   * brand. See src/lib/branding.ts. This is the client workspace shell;
   * it never renders platform/admin nav (Bible Part 2 / ADR-001). */
  brandName?: string;
  brandTagline?: string | null;
  /** PLATFORM brand — shown only as a small "Powered by" credit. */
  platformName?: string;
}

export function Sidebar({
  brandName = "Studio",
  brandTagline,
  platformName = "YT Automation",
}: SidebarProps) {
  const [collapsed, setCollapsed] = React.useState(false);

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-sidebar/80 backdrop-blur-md transition-[width] duration-200 ease-out md:flex",
        collapsed ? "w-[76px]" : "w-64"
      )}
    >
      {/* Client brand (current tenant) */}
      <div className="flex h-16 items-center gap-2.5 border-b border-border px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Clapperboard className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </div>
        {!collapsed && (
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-semibold tracking-tight text-foreground">
              {brandName}
            </span>
            <span className="truncate text-[10px] font-medium tracking-[0.18em] text-muted-foreground">
              {(brandTagline || "STUDIO").toUpperCase()}
            </span>
          </div>
        )}
      </div>

      <NavList collapsed={collapsed} />

      {/* Platform brand credit */}
      {!collapsed && (
        <div className="px-4 pb-1 pt-2">
          <p className="truncate text-[10px] font-medium text-muted-foreground/70">
            Powered by {platformName}
          </p>
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
