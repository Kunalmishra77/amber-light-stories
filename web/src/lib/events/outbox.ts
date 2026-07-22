import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Transactional outbox (M14 B1 — ADR-070).
 *
 * Outbox rows are normally produced by DB TRIGGERS on the owning table, so a
 * state change can never commit without its event. This module provides the
 * relay (publish pending rows), explicit emission for domains without a
 * trigger, and contract validation against the event registry (ADR-077).
 *
 * Delivery is AT-LEAST-ONCE; consumers must dedupe via `withIdempotency`.
 */
export interface OutboxRow {
  id: string;
  tenant_id: string | null;
  event_type: string;
  event_version: number;
  aggregate_type: string | null;
  aggregate_id: string | null;
  payload: Record<string, unknown>;
  idempotency_key: string | null;
  correlation_id: string | null;
  attempts: number;
  max_attempts: number;
}

/** Explicitly enqueue an event. Prefer a trigger where a state table owns it. */
export async function emitEvent(
  input: {
    tenantId: string | null;
    eventType: string;
    aggregateType?: string | null;
    aggregateId?: string | null;
    payload?: Record<string, unknown>;
    idempotencyKey?: string | null;
    correlationId?: string | null;
  },
  client?: SupabaseClient
): Promise<{ ok: boolean; deduped: boolean; error?: string }> {
  const db = client ?? createAdminClient();
  const { error } = await db.from("event_outbox").insert({
    tenant_id: input.tenantId,
    event_type: input.eventType,
    aggregate_type: input.aggregateType ?? null,
    aggregate_id: input.aggregateId ?? null,
    payload: input.payload ?? {},
    idempotency_key: input.idempotencyKey ?? null,
    correlation_id: input.correlationId ?? null,
  });
  if (error) {
    // A duplicate producer key is a successful no-op, not a failure.
    if (error.code === "23505") return { ok: true, deduped: true };
    return { ok: false, deduped: false, error: error.message };
  }
  return { ok: true, deduped: false };
}

/** Validate a payload against its registered contract (ADR-077). */
export function validateAgainstContract(
  payload: Record<string, unknown>,
  schema: { required?: string[] } | null | undefined
): { valid: boolean; missing: string[] } {
  const required = schema?.required ?? [];
  const missing = required.filter((k) => payload[k] === undefined || payload[k] === null);
  return { valid: missing.length === 0, missing };
}

/** Exponential backoff for a failed publish (same shape as the job engine). */
export function publishBackoffMs(attempt: number, baseMs = 5000, capMs = 3_600_000): number {
  return Math.min(baseMs * 2 ** Math.max(0, attempt - 1), capMs);
}

/**
 * Claim a batch of pending outbox rows. Ordered by creation time so events for
 * one aggregate are published in the order they occurred.
 */
export async function claimPending(limit = 50, client?: SupabaseClient): Promise<OutboxRow[]> {
  const db = client ?? createAdminClient();
  const { data } = await db
    .from("event_outbox")
    .select(
      "id, tenant_id, event_type, event_version, aggregate_type, aggregate_id, payload, idempotency_key, correlation_id, attempts, max_attempts"
    )
    .eq("status", "pending")
    .lte("available_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(limit);
  return (data ?? []) as OutboxRow[];
}

export async function markPublished(id: string, client?: SupabaseClient): Promise<void> {
  const db = client ?? createAdminClient();
  await db
    .from("event_outbox")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", id);
}

/** Retry with backoff, or dead-letter once attempts are exhausted. */
export async function markFailed(
  row: Pick<OutboxRow, "id" | "attempts" | "max_attempts">,
  error: string,
  client?: SupabaseClient
): Promise<"pending" | "dead"> {
  const db = client ?? createAdminClient();
  const attempts = row.attempts + 1;
  const dead = attempts >= row.max_attempts;
  await db
    .from("event_outbox")
    .update({
      status: dead ? "dead" : "pending",
      attempts,
      last_error: error.slice(0, 1000),
      available_at: dead ? undefined : new Date(Date.now() + publishBackoffMs(attempts)).toISOString(),
    })
    .eq("id", row.id);
  return dead ? "dead" : "pending";
}
