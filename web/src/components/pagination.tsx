import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// Re-exported so callers can keep importing both from one place.
export { parsePage, pageRange, DEFAULT_PAGE_SIZE } from "@/lib/pagination";

/**
 * Cursor-free page navigation for list surfaces.
 *
 * The audit found NO pagination anywhere: every list either fetched unbounded
 * or silently truncated at a hard cap, with no way to reach row N+1 and no hint
 * that anything was missing. This renders the range honestly ("1–50 of 4,312")
 * so a truncated view can never be mistaken for a complete one.
 */
export function Pagination({
  page,
  pageSize,
  total,
  basePath,
  params = {},
}: {
  /** 1-based. */
  page: number;
  pageSize: number;
  /** Total matching rows; null when the count is unavailable. */
  total: number | null;
  basePath: string;
  /** Other query params to preserve across pages. */
  params?: Record<string, string | undefined>;
}) {
  const lastPage = total === null ? page : Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = total === null ? page * pageSize : Math.min(total, page * pageSize);

  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    if (p > 1) q.set("page", String(p));
    const qs = q.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const canPrev = page > 1;
  const canNext = total === null ? true : page < lastPage;
  if (!canPrev && !canNext) {
    return (
      <p className="px-5 py-3 text-xs text-muted-foreground">
        {total === null ? `${to - from + 1} shown` : `${total} total`}
      </p>
    );
  }

  const linkClass = (enabled: boolean) =>
    cn(
      "inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium transition-colors",
      enabled
        ? "text-foreground hover:bg-elevated"
        : "cursor-not-allowed text-muted-foreground opacity-50"
    );

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
      <p className="text-xs tabular-nums text-muted-foreground">
        {from}–{to}
        {total !== null && ` of ${total.toLocaleString()}`}
      </p>
      <div className="flex items-center gap-2">
        {canPrev ? (
          <Link href={href(page - 1)} className={linkClass(true)} rel="prev">
            <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} />
            Previous
          </Link>
        ) : (
          <span className={linkClass(false)}>
            <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} />
            Previous
          </span>
        )}
        {canNext ? (
          <Link href={href(page + 1)} className={linkClass(true)} rel="next">
            Next
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
          </Link>
        ) : (
          <span className={linkClass(false)}>
            Next
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
          </span>
        )}
      </div>
    </div>
  );
}
