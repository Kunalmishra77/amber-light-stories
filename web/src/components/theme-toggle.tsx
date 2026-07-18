"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label="Toggle theme"
      suppressHydrationWarning
      className={cn(
        "relative inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-border bg-elevated text-muted-foreground transition-colors duration-200 ease-out hover:border-primary/40 hover:text-primary"
      )}
    >
      {isDark ? (
        <Sun className="h-[18px] w-[18px]" strokeWidth={1.75} suppressHydrationWarning />
      ) : (
        <Moon className="h-[18px] w-[18px]" strokeWidth={1.75} suppressHydrationWarning />
      )}
    </button>
  );
}
