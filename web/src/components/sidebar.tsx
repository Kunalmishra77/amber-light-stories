"use client";

import * as React from "react";
import { Clapperboard, ChevronsLeft, ChevronsRight } from "lucide-react";
import { NavList } from "@/components/nav-list";
import { cn } from "@/lib/utils";

interface SidebarProps {
  isSuperAdmin?: boolean;
}

export function Sidebar({ isSuperAdmin = false }: SidebarProps) {
  const [collapsed, setCollapsed] = React.useState(false);

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200 ease-out md:flex",
        collapsed ? "w-[76px]" : "w-64"
      )}
    >
      {/* Brand */}
      <div className="flex h-16 items-center gap-2.5 border-b border-border px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Clapperboard className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </div>
        {!collapsed && (
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-semibold tracking-tight text-foreground">
              Amber Light Stories
            </span>
            <span className="text-[10px] font-medium tracking-[0.18em] text-muted-foreground">
              STUDIO
            </span>
          </div>
        )}
      </div>

      <NavList collapsed={collapsed} isSuperAdmin={isSuperAdmin} />

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
