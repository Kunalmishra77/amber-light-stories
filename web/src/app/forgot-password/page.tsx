import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getPlatformSettings } from "@/lib/branding";
import { ForgotPasswordForm } from "./forgot-password-form";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const platform = await getPlatformSettings();
  return { title: `Reset password — ${platform.platform_name}` };
}

export default async function ForgotPasswordPage() {
  const platform = await getPlatformSettings();

  return (
    <div className="relative flex min-h-dvh w-full items-center justify-center overflow-hidden px-4 py-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 h-[480px] w-[480px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-primary/20 blur-[120px]"
      />

      <div className="relative flex w-full max-w-sm flex-col gap-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <div
            aria-hidden="true"
            className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-2xl shadow-[0_0_40px_-8px_var(--primary)]"
          >
            {platform.favicon_emoji}
          </div>
          <span className="text-lg font-semibold tracking-tight text-foreground">
            {platform.platform_name}
          </span>
        </div>

        <div className="flex flex-col gap-6 rounded-2xl border border-border bg-elevated p-7 shadow-xl shadow-black/5 dark:shadow-black/40">
          <div className="flex flex-col gap-1">
            <h1 className="text-lg font-semibold text-foreground">Reset your password</h1>
            <p className="text-sm text-muted-foreground">
              Enter your account email and we&apos;ll send you a link to reset your password.
            </p>
          </div>

          <Suspense fallback={<p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>}>
            <ForgotPasswordForm />
          </Suspense>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Remembered your password?{" "}
          <Link href="/login" className="font-medium text-primary hover:text-primary-hover">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
