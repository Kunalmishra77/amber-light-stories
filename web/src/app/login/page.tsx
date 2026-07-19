import type { Metadata } from "next";
import { Suspense } from "react";
import { getPlatformSettings } from "@/lib/branding";
import { LoginForm } from "./login-form";

// Auth state is per-request and never prerendered.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const platform = await getPlatformSettings();
  return { title: `Sign in — ${platform.platform_name}` };
}

export default async function LoginPage() {
  const platform = await getPlatformSettings();

  return (
    <div className="relative flex min-h-dvh w-full items-center justify-center overflow-hidden px-4 py-12">
      {/* Ambient amber glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 h-[480px] w-[480px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-primary/20 blur-[120px]"
      />

      <div className="relative flex w-full max-w-sm flex-col gap-8">
        {/* Platform brand — never the client/tenant brand, which only
            appears inside the signed-in workspace sidebar. */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div
            aria-hidden="true"
            className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-2xl shadow-[0_0_40px_-8px_var(--primary)]"
          >
            {platform.favicon_emoji}
          </div>
          <div className="flex flex-col items-center leading-tight">
            <span className="text-lg font-semibold tracking-tight text-foreground">
              {platform.platform_name}
            </span>
            <span className="text-[11px] font-medium tracking-[0.22em] text-muted-foreground">
              ENTERPRISE AI VIDEO AUTOMATION
            </span>
          </div>
        </div>

        {/* Card */}
        <div className="flex flex-col gap-6 rounded-2xl border border-border bg-elevated p-7 shadow-xl shadow-black/5 dark:shadow-black/40">
          <div className="flex flex-col gap-1">
            <h1 className="text-lg font-semibold text-foreground">Sign in</h1>
            <p className="text-sm text-muted-foreground">
              Welcome back. Enter your credentials to continue.
            </p>
          </div>

          <Suspense
            fallback={
              <p className="py-6 text-center text-sm text-muted-foreground">
                {platform.loading_message}
              </p>
            }
          >
            <LoginForm />
          </Suspense>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          No public sign-up — contact your administrator for access.
        </p>
      </div>
    </div>
  );
}
