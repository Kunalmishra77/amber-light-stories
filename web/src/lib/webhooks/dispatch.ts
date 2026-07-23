import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildSignatureHeader } from "@/lib/webhooks/sign";
import { API_VERSION } from "@/lib/api/version";

/**
 * Outbound signed webhook dispatch (M8 / P2-12). Finds a tenant's enabled
 * endpoints subscribed to `eventType` (or `*`), signs the payload with each
 * endpoint's secret (HMAC-SHA256), POSTs it, and records the attempt in
 * `webhook_deliveries`. Provider-independent (plain HTTP + HMAC) and fully
 * fire-and-forget safe — it never throws, so callers on hot paths (e.g.
 * generation) can `await` it without risk.
 */
export interface WebhookEventInput {
  tenantId: string;
  eventType: string;
  data: Record<string, unknown>;
}

const DISPATCH_TIMEOUT_MS = 8000;

export async function dispatchEvent(input: WebhookEventInput): Promise<{ delivered: number; failed: number }> {
  let delivered = 0;
  let failed = 0;
  try {
    const admin = createAdminClient();
    const { data: endpoints } = await admin
      .from("webhook_endpoints")
      .select("id, url, signing_secret, event_types")
      .eq("tenant_id", input.tenantId)
      .eq("enabled", true);

    const targets = ((endpoints ?? []) as {
      id: string;
      url: string;
      signing_secret: string;
      event_types: string[];
    }[]).filter(
      (e) => e.event_types.includes("*") || e.event_types.includes(input.eventType)
    );

    for (const endpoint of targets) {
      const timestampSec = Math.floor(Date.now() / 1000);
      const body = JSON.stringify({
        id: crypto.randomUUID(),
        type: input.eventType,
        api_version: API_VERSION,
        created: timestampSec,
        data: input.data,
      });
      const signature = buildSignatureHeader(endpoint.signing_secret, body, timestampSec);

      let status: "success" | "failed" = "failed";
      let statusCode: number | null = null;
      let error: string | null = null;

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), DISPATCH_TIMEOUT_MS);
        const res = await fetch(endpoint.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Webhook-Signature": signature,
            "X-Webhook-Event": input.eventType,
          },
          body,
          signal: controller.signal,
        });
        clearTimeout(timer);
        statusCode = res.status;
        status = res.ok ? "success" : "failed";
        if (!res.ok) error = `Endpoint returned ${res.status}`;
      } catch (err) {
        error = err instanceof Error ? err.message : "Dispatch failed";
      }

      if (status === "success") delivered++;
      else failed++;

      await admin.from("webhook_deliveries").insert({
        tenant_id: input.tenantId,
        endpoint_id: endpoint.id,
        event_type: input.eventType,
        payload: input.data,
        status,
        status_code: statusCode,
        attempts: 1,
        error,
        signature,
        delivered_at: status === "success" ? new Date().toISOString() : null,
      });
    }
  } catch {
    // Never let webhook dispatch break the caller's primary operation.
  }
  return { delivered, failed };
}

/**
 * Dispatch AFTER the response has been sent.
 *
 * `dispatchEvent` POSTs to each subscribed endpoint sequentially with an 8s
 * timeout apiece, so awaiting it inline added up to 8s per endpoint to a user's
 * button click — a customer with three webhooks made "Generate" take half a
 * minute. Next's `after()` runs the work once the response is flushed, so the
 * user isn't waiting on someone else's server.
 *
 * Outside a request scope (a durable job worker) `after()` is unavailable, so
 * we fall back to awaiting — a worker has no user waiting on it.
 */
export async function dispatchEventAfterResponse(input: WebhookEventInput): Promise<void> {
  try {
    const { after } = await import("next/server");
    after(() => dispatchEvent(input));
  } catch {
    await dispatchEvent(input);
  }
}
