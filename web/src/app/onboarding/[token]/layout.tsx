import { getPlatformSettings } from "@/lib/branding";

/**
 * Standalone shell for the public onboarding wizard — deliberately outside
 * the (dashboard) group, so it gets none of the Sidebar/Topbar chrome and
 * none of its auth assumptions. Mirrors the /login page's look (ambient
 * amber glow, centered card) since this is the client's first impression.
 * Platform brand only — never the client/tenant brand, which only appears
 * inside the signed-in workspace sidebar.
 */
export default async function OnboardingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const platform = await getPlatformSettings();

  return (
    <div className="relative flex min-h-dvh w-full flex-col items-center overflow-x-hidden px-4 py-12">
      {/* Ambient amber glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 h-[480px] w-[480px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-primary/20 blur-[120px]"
      />

      <div className="relative mb-10 flex flex-col items-center gap-3 text-center">
        <div
          aria-hidden="true"
          className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-2xl shadow-[0_0_40px_-8px_var(--primary)]"
        >
          {platform.favicon_emoji}
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-lg font-semibold tracking-tight text-foreground">
            Welcome to {platform.platform_name}
          </span>
          <span className="text-[11px] font-medium tracking-[0.22em] text-muted-foreground">
            CLIENT ONBOARDING
          </span>
        </div>
      </div>

      <div className="relative flex w-full flex-1 flex-col items-center">{children}</div>
    </div>
  );
}
