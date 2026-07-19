"use client";

import { useEffect, useState } from "react";

export type ClientTimeMode = "date" | "datetime" | "time" | "relative";

interface ClientTimeProps {
  /** ISO-ish date string (or null/undefined for "no value"). */
  value: string | null | undefined;
  mode?: ClientTimeMode;
  /** Override the default Intl.DateTimeFormatOptions for "date"/"datetime"/"time" modes. */
  options?: Intl.DateTimeFormatOptions;
  /** Shown when value is missing or unparsable. Defaults to an em dash. */
  fallback?: string;
  className?: string;
}

const DEFAULT_OPTIONS: Record<Exclude<ClientTimeMode, "relative">, Intl.DateTimeFormatOptions> = {
  date: { month: "short", day: "numeric", year: "numeric" },
  datetime: { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
  time: { hour: "numeric", minute: "2-digit" },
};

function formatRelative(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}

/**
 * Hydration-safe date/time renderer.
 *
 * `new Date(x).toLocaleString()` (and friends) resolve the viewer's locale
 * and timezone — which differ between the server (Node's default locale /
 * UTC-ish server clock) and the browser (the visitor's real locale and
 * timezone). Rendering that text directly during SSR produces HTML that
 * doesn't match what the client would render on its first pass, which is
 * exactly React error #418 ("text content does not match server-rendered
 * HTML").
 *
 * The fix: never format a locale/timezone-dependent string during the
 * render that has to match between server and client. On the server (and
 * on the client's *first* render, before the browser has committed the
 * hydrated tree) this renders a stable, timezone-independent placeholder —
 * for date-ish modes, the ISO date's `YYYY-MM-DD` slice (identical no
 * matter what timezone reads it); for "relative" mode, nothing. Only after
 * `useEffect` confirms we're mounted on the client does it recompute and
 * swap in the real locale-formatted text. `suppressHydrationWarning` is
 * kept as a belt-and-suspenders guard in case some other code path ever
 * renders this before mount with a value React thinks changed.
 */
export function ClientTime({ value, mode = "datetime", options, fallback = "—", className }: ClientTimeProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!value) {
    return (
      <span suppressHydrationWarning className={className}>
        {fallback}
      </span>
    );
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return (
      <span suppressHydrationWarning className={className}>
        {fallback}
      </span>
    );
  }

  if (!mounted) {
    const placeholder = mode === "relative" ? "" : value.slice(0, 10);
    return (
      <span suppressHydrationWarning className={className}>
        {placeholder}
      </span>
    );
  }

  const text =
    mode === "relative"
      ? formatRelative(date)
      : date.toLocaleString("en-US", options ?? DEFAULT_OPTIONS[mode]);

  return (
    <span suppressHydrationWarning className={className}>
      {text}
    </span>
  );
}
