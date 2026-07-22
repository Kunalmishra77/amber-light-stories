import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { claimPending, markPublished, markFailed, validateAgainstContract } from "@/lib/events/outbox";
import { withIdempotency } from "@/lib/events/idempotency";
import { dispatchEvent } from "@/lib/webhooks/dispatch";
import type { JobHandler } from "@/lib/jobs/types";

/**
 * `outbox.relay` (M14 B1) — publishes committed outbox rows to subscribers.
 * Runs on the EXISTING M11 durable job engine: no second worker system, and it
 * inherits leasing, retries, backoff and DLQ for free.
 *
 * Delivery is at-least-once; the actual side effect (webhook dispatch) is
 * wrapped in the shared idempotency store, so a duplicate relay pass cannot
 * dispatch the same event twice.
 *
 * NOTE (dual-write period): `dispatchEvent` is still called directly by
 * producers today. The relay uses an idempotency scope keyed by the outbox row,
 * so once producers are migrated off the direct call, no double-send occurs.
 */
export const outboxRelayHandler: JobHandler = async () => {
  const admin = createAdminClient();
  const rows = await claimPending(50, admin);

  let published = 0;
  let failed = 0;
  let dead = 0;
  let skippedInvalid = 0;
  let duplicates = 0;

  // Contracts, loaded once per pass (ADR-077).
  const { data: registry } = await admin
    .from("event_registry")
    .select("event_type, version, payload_schema, status");
  const contracts = new Map(
    ((registry ?? []) as Array<{ event_type: string; version: number; payload_schema: { required?: string[] }; status: string }>)
      .map((r) => [`${r.event_type}:${r.version}`, r])
  );

  for (const row of rows) {
    const contract = contracts.get(`${row.event_type}:${row.event_version}`);

    // An unregistered or contract-violating event is a producer bug: fail it
    // loudly rather than shipping a malformed payload to subscribers.
    if (!contract) {
      await markFailed(row, `event ${row.event_type} v${row.event_version} is not registered`, admin);
      skippedInvalid++;
      continue;
    }
    const check = validateAgainstContract(row.payload, contract.payload_schema);
    if (!check.valid) {
      const outcome = await markFailed(row, `payload violates contract; missing: ${check.missing.join(", ")}`, admin);
      if (outcome === "dead") dead++;
      skippedInvalid++;
      continue;
    }

    try {
      const outcome = await withIdempotency(
        { scope: "outbox.relay", key: row.id, tenantId: row.tenant_id },
        async () => {
          if (row.tenant_id) {
            const res = await dispatchEvent({
              tenantId: row.tenant_id,
              eventType: row.event_type,
              data: { ...row.payload, correlation_id: row.correlation_id },
            });
            return { delivered: res.delivered, failed: res.failed };
          }
          return { delivered: 0, failed: 0 };
        },
        admin
      );
      if (outcome.duplicate) duplicates++;
      await markPublished(row.id, admin);
      published++;
    } catch (err) {
      const outcome = await markFailed(row, err instanceof Error ? err.message : "publish failed", admin);
      failed++;
      if (outcome === "dead") dead++;
    }
  }

  return { checkpoint: { claimed: rows.length, published, failed, dead, skippedInvalid, duplicates } };
};
