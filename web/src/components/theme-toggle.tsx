"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // next-themes cannot know the resolved theme during SSR, so the icon must
  // be identical on the server and the first client render, then swap after
  // mount. Rendering a theme-dependent icon before mount causes a hydration
  // mismatch (React error #418) because the SVG children differ (Sun's
  // <circle> vs Moon's <path>) — and suppressHydrationWarning does NOT cover
  // differing child element trees.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";
  // Before mount, always render the same icon (Sun — the default dark theme's
  // icon) so server and initial client render match exactly.
  const showSun = !mounted || isDark;

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label="Toggle theme"
      className={cn(
        "relative inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-border bg-elevated text-muted-foreground transition-colors duration-200 ease-out hover:border-primary/40 hover:text-primary"
      )}
    >
      {showSun ? (
        <Sun className="h-[18px] w-[18px]" strokeWidth={1.75} />
      ) : (
        <Moon className="h-[18px] w-[18px]" strokeWidth={1.75} />
      )}
    </button>
  );
}
