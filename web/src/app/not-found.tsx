import Link from "next/link";
import { Compass } from "lucide-react";

/** Branded 404, so a mistyped or stale URL doesn't drop the user on Next's default page. */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-elevated text-muted-foreground">
        <Compass className="h-5 w-5" strokeWidth={1.75} />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">We couldn&apos;t find that page</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          The link may be out of date, or the item may have been removed.
        </p>
      </div>
      <Link
        href="/"
        className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-on-primary transition-colors hover:bg-primary-hover"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
