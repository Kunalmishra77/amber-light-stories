import { KeyRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId, isOwnerOrManager } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ApiKeysSection, type ApiKeyView } from "./api-keys-section";
import { WebhooksSection, type WebhookView, type DeliveryView } from "./webhooks-section";

// Tenant-scoped developer console — reads live on every request.
export const dynamic = "force-dynamic";

export default async function DeveloperPage() {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) {
    return (
      <div>
        <PageHeader title="Developer" description="Public API keys and webhooks for this workspace." />
        <EmptyState icon={KeyRound} title="Join a workspace to manage API access" />
      </div>
    );
  }

  const canEdit = await isOwnerOrManager(tenantId);
  const supabase = await createClient();

  const [keysRes, endpointsRes, deliveriesRes] = await Promise.all([
    supabase
      .from("api_keys")
      .select("id, name, prefix, scopes, rate_limit_per_min, last_used_at, revoked_at, rotated_at, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false }),
    supabase
      .from("webhook_endpoints")
      .select("id, url, event_types, enabled, description, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false }),
    supabase
      .from("webhook_deliveries")
      .select("id, endpoint_id, event_type, status, status_code, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const keys = (keysRes.data ?? []) as ApiKeyView[];
  const endpoints = (endpointsRes.data ?? []) as WebhookView[];
  const deliveries = (deliveriesRes.data ?? []) as DeliveryView[];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Developer"
        description="Issue scoped API keys and register signed webhooks for this workspace. The public API is served under /api/v1; secrets are shown only once."
      />

      {!canEdit ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-3 text-xs text-muted-foreground">
          You can view API access here, but only workspace owners or managers can issue keys or register
          webhooks.
        </p>
      ) : null}

      <ApiKeysSection keys={keys} canEdit={canEdit} />
      <WebhooksSection endpoints={endpoints} deliveries={deliveries} canEdit={canEdit} />
    </div>
  );
}
