import { MonitorPlay, CheckCircle2, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/auth";
import { listPublishingTargets } from "@/lib/providers/publishing";
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

export default async function YouTubePage() {
  const supabase = await createClient();
  const tenantId = (await getCurrentTenantId()) ?? "";

  // Per-tenant, provider-abstracted publishing targets (ISS-B1 / ISS-E1) —
  // never a global .env channel.
  const [channelRows, { data: credential }] = await Promise.all([
    listPublishingTargets(tenantId, "youtube"),
    supabase
      .from("tenant_credentials")
      .select("status, last_checked_at")
      .eq("tenant_id", tenantId)
      .eq("provider", "youtube")
      .maybeSingle<CredentialRow>(),
  ]);

  const connected = channelRows.length > 0;

  return (
    <div>
      <PageHeader
        title="YouTube"
        description="Connect and monitor the YouTube channel this workspace publishes to."
      />

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
        <button
          type="button"
          disabled
          title="OAuth connection lands in a later phase"
          className="inline-flex shrink-0 cursor-not-allowed items-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2 text-xs font-medium text-muted-foreground opacity-70"
        >
          <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} />
          Connect via Google — coming soon
        </button>
      </div>

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
