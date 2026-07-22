"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";

/** Route-level error boundary for the platform console. */
export default function PlatformError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[platform] render failed:", error.message, error.digest ?? "");
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-elevated text-muted-foreground">
        <AlertTriangle className="h-5 w-5" strokeWidth={1.75} />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">This console page didn&apos;t load</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          A query failed while building this view. Nothing has been changed.
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
          href="/admin"
          className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-foreground transition-colors hover:bg-elevated"
        >
          Console overview
        </Link>
      </div>
      {error.digest && (
        <p className="text-[11px] text-muted-foreground">Reference: {error.digest}</p>
      )}
    </div>
  );
}
