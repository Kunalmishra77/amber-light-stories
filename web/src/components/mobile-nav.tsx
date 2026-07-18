"use client";

import * as React from "react";
import { Menu, X, Clapperboard } from "lucide-react";
import { NavList } from "@/components/nav-list";

interface MobileNavProps {
  isSuperAdmin?: boolean;
}

export function MobileNav({ isSuperAdmin = false }: MobileNavProps) {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-border bg-elevated text-muted-foreground transition-colors duration-200 ease-out hover:text-foreground md:hidden"
      >
        <Menu className="h-[18px] w-[18px]" strokeWidth={1.75} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            aria-label="Close navigation"
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="relative flex h-full w-72 max-w-[80vw] flex-col border-r border-border bg-surface">
            <div className="flex h-16 items-center justify-between border-b border-border px-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Clapperboard className="h-[18px] w-[18px]" strokeWidth={1.75} />
                </div>
                <div className="flex flex-col leading-tight">
                  <span className="text-sm font-semibold tracking-tight text-foreground">
                    Amber Light Stories
                  </span>
                  <span className="text-[10px] font-medium tracking-[0.18em] text-muted-foreground">
                    STUDIO
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation"
                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 ease-out hover:bg-elevated hover:text-foreground"
              >
                <X className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </button>
            </div>
            <NavList
              onNavigate={() => setOpen(false)}
              isSuperAdmin={isSuperAdmin}
            />
          </div>
        </div>
      )}
    </>
  );
}
