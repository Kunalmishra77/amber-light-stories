import Link from "next/link";
import type { ReactNode } from "react";
import { getPlatformSettings } from "@/lib/branding";

/**
 * Shell for the PUBLIC pages (/welcome, /privacy, /terms) — the only pages a
 * signed-out visitor can reach. Deliberately has no sidebar or app chrome:
 * these are the marketing/legal surface, and /welcome doubles as the
 * "application home page" Google's OAuth verification requires.
 */
export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const { platform_name } = await getPlatformSettings();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/70 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link
            href="/welcome"
            className="text-base font-semibold tracking-tight text-foreground"
          >
            {platform_name}
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-colors duration-200 hover:bg-primary-hover"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border bg-surface/60 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            © {new Date().getFullYear()} {platform_name}. All rights reserved.
          </p>
          <nav className="flex items-center gap-5" aria-label="Legal">
            <Link href="/privacy" className="transition-colors hover:text-foreground">
              Privacy Policy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-foreground">
              Terms of Service
            </Link>
            <Link href="/login" className="transition-colors hover:text-foreground">
              Sign in
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
