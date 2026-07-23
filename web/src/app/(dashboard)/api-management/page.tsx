import { ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId, isOwnerOrManager } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { CredentialCard, type CredentialCardData } from "./credential-card";
import { OAuthProviderCard } from "./oauth-provider-card";

// Reads live rows from Supabase on every request — never prerender this.
export const dynamic = "force-dynamic";

interface CredentialRow {
  provider: string;
  status: string | null;
  last_checked_at: string | null;
}

// Gmail is a PLATFORM credential (the notification sender), not client-provided,
// so it is deliberately absent here. YouTube connects via OAuth on /youtube and
// is shown as an OAuth card, not a paste-a-key card.
const KEY_PROVIDERS: { provider: string; label: string }[] = [
  { provider: "openai", label: "OpenAI" },
  { provider: "gemini", label: "Google Gemini" },
  { provider: "elevenlabs", label: "ElevenLabs" },
  { provider: "fal", label: "fal.ai" },
];

export default async function ApiManagementPage() {
  const supabase = await createClient();
  const tenantId = (await getCurrentTenantId()) ?? "";

  const [{ data: credentials }, canEdit] = await Promise.all([
    supabase
      .from("tenant_credentials")
      .select("provider, status, last_checked_at")
      .eq("tenant_id", tenantId),
    isOwnerOrManager(tenantId),
  ]);

  const byProvider = new Map(((credentials ?? []) as CredentialRow[]).map((c) => [c.provider, c]));

  const cards: CredentialCardData[] = KEY_PROVIDERS.map(({ provider, label }) => {
    const row = byProvider.get(provider);
    return {
      provider,
      label,
      status: row?.status ?? null,
      lastCheckedAt: row?.last_checked_at ?? null,
      connected: Boolean(row),
    };
  });

  // YouTube: publishing destination, connected by OAuth (not a key).
  const yt = byProvider.get("youtube");
  const youtubeConnected = yt?.status === "connected";

  return (
    <div>
      <PageHeader
        title="API Management"
        description="Provider credentials for this workspace's AI & publishing pipeline."
      />

      <div className="mb-6 flex items-start gap-3 rounded-lg border border-border bg-surface/60 px-4 py-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={1.75} />
        <p className="text-xs text-muted-foreground">
          Keys are encrypted at rest in Supabase Vault and never displayed or returned once saved
          — only their connection status is shown here. Only owners and managers can rotate keys.
        </p>
      </div>

      <h2 className="mb-3 text-sm font-semibold text-foreground">AI providers</h2>
      <p className="mb-4 text-xs text-muted-foreground">
        Connect at least one text provider (OpenAI or Gemini) for real AI script generation. Voice
        (ElevenLabs) and image/video (fal.ai) power the render pipeline.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <CredentialCard key={card.provider} credential={card} canEdit={canEdit} />
        ))}
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold text-foreground">Publishing</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <OAuthProviderCard
          provider="youtube"
          label="YouTube"
          connected={youtubeConnected}
          href="/youtube"
        />
      </div>
    </div>
  );
}
