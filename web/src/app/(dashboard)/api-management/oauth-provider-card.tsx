import Link from "next/link";
import { ArrowRight, CheckCircle2, MonitorPlay } from "lucide-react";
import { PROVIDER_HELP } from "@/lib/providers/provider-help";

/**
 * OAuth-connected provider card (YouTube). Connecting a channel is a Google
 * sign-in on the /youtube page, not a pasted API key — so this links there
 * rather than showing a key field, which the audit flagged as a dead end.
 */
export function OAuthProviderCard({
  provider,
  label,
  connected,
  href,
}: {
  provider: string;
  label: string;
  connected: boolean;
  href: string;
}) {
  const help = PROVIDER_HELP[provider];

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-elevated p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <MonitorPlay className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </div>
          <p className="text-sm font-medium text-foreground">{label}</p>
        </div>
        {connected ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--status-approved)]/30 bg-[var(--status-approved)]/10 px-2.5 py-1 text-xs font-medium text-[var(--status-approved)]">
            <CheckCircle2 className="h-3 w-3" strokeWidth={2} />
            Connected
          </span>
        ) : (
          <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-muted-foreground">
            Not connected
          </span>
        )}
      </div>

      {help && <p className="text-xs text-muted-foreground">{help.purpose}</p>}

      <Link
        href={href}
        className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-elevated"
      >
        {connected ? "Manage channel" : "Connect with Google"}
        <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
      </Link>
    </div>
  );
}
