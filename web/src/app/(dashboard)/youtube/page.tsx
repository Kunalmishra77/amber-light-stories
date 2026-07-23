import { MonitorPlay, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId, requirePermission } from "@/lib/auth";
import { listPublishingTargets } from "@/lib/providers/publishing";
import { isOAuthConfigured } from "@/lib/providers/youtube-config";
import { ConnectControls } from "./connect-controls";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";

// Reads live rows from Supabase on every request — never prerender this.
export const dynamic = "force-dynamic";

interface CredentialRow {
  status: string | null;
  last_checked_at: string | null;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const CONNECT_MESSAGES: Record<string, { tone: "ok" | "error"; text: string }> = {
  success: { tone: "ok", text: "Channel connected. Publishing will now upload to your channel." },
  denied: { tone: "error", text: "You cancelled the Google authorization — nothing was changed." },
  "invalid-state": {
    tone: "error",
    text: "That connection link expired or didn't match. Please start again.",
  },
  "signed-out": { tone: "error", text: "Your session ended during the connection. Sign in and retry." },
  "context-changed": {
    tone: "error",
    text: "The workspace changed while connecting. Please start again from this workspace.",
  },
  forbidden: { tone: "error", text: "You don't have permission to connect a channel." },
  "not-configured": {
    tone: "error",
    text: "YouTube connection isn't configured on this platform yet.",
  },
  "no-workspace": { tone: "error", text: "You're not a member of any workspace." },
  "auth-failed": { tone: "error", text: "Google rejected the authorization." },
  failed: { tone: "error", text: "The connection didn't complete. Please try again." },
};

export default async function YouTubePage({
  searchParams,
}: {
  searchParams: Promise<{ connect?: string; detail?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const tenantId = (await getCurrentTenantId()) ?? "";

  // Per-tenant, provider-abstracted publishing targets (ISS-B1 / ISS-E1) —
  // never a global .env channel.
  const [channelRows, { data: credential }, canManage] = await Promise.all([
    listPublishingTargets(tenantId, "youtube"),
    supabase
      .from("tenant_credentials")
      .select("status, last_checked_at")
      .eq("tenant_id", tenantId)
      .eq("provider", "youtube")
      .maybeSingle<CredentialRow>(),
    requirePermission("channels.manage", tenantId),
  ]);

  const activeChannel = channelRows.find((c) => c.status === "connected") ?? null;
  const connected = activeChannel !== null && credential?.status === "connected";
  const configured = isOAuthConfigured();
  const banner = params.connect ? CONNECT_MESSAGES[params.connect] : null;

  return (
    <div>
      <PageHeader
        title="YouTube"
        description="Connect and monitor the YouTube channel this workspace publishes to."
      />

      {banner && (
        <div
          className={
            banner.tone === "ok"
              ? "mb-6 rounded-xl border border-status-approved/30 bg-status-approved/10 px-4 py-3 text-sm text-foreground"
              : "mb-6 rounded-xl border border-status-failed/30 bg-status-failed/10 px-4 py-3 text-sm text-foreground"
          }
        >
          {banner.text}
          {params.detail && <span className="block text-xs text-muted-foreground">{params.detail}</span>}
        </div>
      )}

      <div className="mb-8 flex flex-col gap-4 rounded-xl border border-border bg-elevated p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <MonitorPlay className="h-5 w-5" strokeWidth={1.75} />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              {connected ? "Channel connected" : "No channel connected"}
            </p>
            <p className="text-xs text-muted-foreground">
              Credential status:{" "}
              <StatusBadge status={credential?.status ?? "pending"} className="ml-1 align-middle" />
            </p>
          </div>
        </div>
        <ConnectControls connected={connected} canManage={canManage} configured={configured} />
      </div>

      {connected && (
        <p className="mb-6 rounded-xl border border-border bg-surface px-4 py-3 text-xs text-muted-foreground">
          Approved videos upload to this channel as <strong>private</strong>. Review them on YouTube
          and make them public when you&apos;re ready — nothing is made public automatically.
        </p>
      )}

      {channelRows.length === 0 ? (
        <EmptyState
          icon={MonitorPlay}
          title="No channel connected yet"
          description="Once a YouTube channel is connected via OAuth, it'll show up here with its upload status."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-elevated">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-3 font-medium">Channel</th>
                <th className="px-5 py-3 font-medium">Channel ID</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Connected</th>
              </tr>
            </thead>
            <tbody>
              {channelRows.map((channel) => (
                <tr key={channel.id} className="border-b border-border/60 last:border-0">
                  <td className="px-5 py-3 font-medium text-foreground">
                    {channel.title || "Untitled channel"}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-muted-foreground">
                    {channel.externalChannelId || "—"}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={channel.status ?? "connected"} />
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-[var(--status-approved)]" strokeWidth={2} />
                      {formatDate(channel.createdAt)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
