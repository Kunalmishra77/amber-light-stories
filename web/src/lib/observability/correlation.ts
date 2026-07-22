import { randomUUID } from "crypto";

/**
 * Correlation IDs (M14 B2). One id threads request -> job -> workflow -> event
 * -> provider call -> audit so an incident can be reconstructed end to end.
 *
 * Pure helpers (no DB, no server-only) so propagation rules are unit-testable.
 * The ambient value is published to Postgres via `set_config('app.correlation_id')`
 * so DB triggers — notably the outbox trigger — stamp it automatically.
 */
export const CORRELATION_HEADER = "x-correlation-id";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidCorrelationId(value: string | null | undefined): boolean {
  return typeof value === "string" && UUID_RE.test(value);
}

export function newCorrelationId(): string {
  return randomUUID();
}

/**
 * Adopt an inbound correlation id when it is well-formed, otherwise mint one.
 * Never trust an arbitrary caller-supplied string into logs/DB columns.
 */
export function resolveCorrelationId(inbound: string | null | undefined): {
  correlationId: string;
  inherited: boolean;
} {
  if (isValidCorrelationId(inbound)) {
    return { correlationId: inbound as string, inherited: true };
  }
  return { correlationId: newCorrelationId(), inherited: false };
}

/** Extract a correlation id from request headers (case-insensitive). */
export function correlationFromHeaders(headers: Headers): string | null {
  return headers.get(CORRELATION_HEADER) ?? headers.get("x-request-id") ?? null;
}

/** Child context for downstream work; the id is carried, never regenerated. */
export function propagate(correlationId: string, extra?: Record<string, unknown>): Record<string, unknown> {
  return { correlationId, ...(extra ?? {}) };
}
