"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Unplug } from "lucide-react";
import { disconnectYouTube } from "./actions";

/**
 * Connect starts a full-page navigation to /api/oauth/youtube/start rather than
 * a fetch: the OAuth flow is a browser redirect to Google and back, and the
 * CSRF nonce cookie has to travel with it.
 */
export function ConnectControls({
  connected,
  canManage,
  configured,
}: {
  connected: boolean;
  canManage: boolean;
  configured: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  if (!canManage) {
    return (
      <p className="text-xs text-muted-foreground">
        Only an owner or manager can connect a channel.
      </p>
    );
  }

  if (!configured) {
    return (
      <p className="max-w-sm text-xs text-muted-foreground">
        YouTube connection isn&apos;t configured on this platform yet. An administrator needs to add
        the Google OAuth credentials before workspaces can connect a channel.
      </p>
    );
  }

  if (connected) {
    return (
      <div className="flex flex-col items-end gap-2">
        <div className="flex items-center gap-2">
          <a
            href="/api/oauth/youtube/start"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2 text-xs font-medium text-foreground transition-colors hover:bg-elevated"
          >
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} />
            Reconnect
          </a>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!window.confirm("Disconnect this channel? Scheduled publishing will stop.")) return;
              startTransition(async () => {
                const r = await disconnectYouTube();
                setMessage(r.ok ? "Channel disconnected." : r.error ?? "Couldn't disconnect.");
                router.refresh();
              });
            }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            <Unplug className="h-3.5 w-3.5" strokeWidth={1.75} />
            Disconnect
          </button>
        </div>
        {message && <p className="text-[11px] text-muted-foreground">{message}</p>}
      </div>
    );
  }

  return (
    <a
      href="/api/oauth/youtube/start"
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-on-primary transition-colors hover:bg-primary-hover"
    >
      <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} />
      Connect with Google
    </a>
  );
}
