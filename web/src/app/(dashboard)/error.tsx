"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";

/**
 * Route-level error boundary for the workspace app.
 *
 * Without this, anything thrown outside a page's own try/catch — a Supabase
 * outage in the layout, a failed session read — escaped to Next's default
 * error screen: unbranded, with no way back and no retry.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard] render failed:", error.message, error.digest ?? "");
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-elevated text-muted-foreground">
        <AlertTriangle className="h-5 w-5" strokeWidth={1.75} />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">This page didn&apos;t load</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Something went wrong reaching your workspace data. Your content is safe — try again, and
          if it keeps happening, send us the reference below.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-on-primary transition-colors hover:bg-primary-hover"
        >
          <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
          Try again
        </button>
        <Link
          href="/"
          className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-foreground transition-colors hover:bg-elevated"
        >
          Back to dashboard
        </Link>
      </div>
      {error.digest && (
        <p className="text-[11px] text-muted-foreground">Reference: {error.digest}</p>
      )}
    </div>
  );
}
