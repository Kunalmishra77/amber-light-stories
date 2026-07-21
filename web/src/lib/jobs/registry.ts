import "server-only";
import type { JobHandler } from "@/lib/jobs/types";
import { analyticsIngestHandler } from "@/lib/jobs/handlers/analytics";

/**
 * Job handler registry (M11-1). Maps a job `type` to its real handler. Adding
 * a durable job type is ONE entry here + one handler — the engine, queue,
 * lease, retry, and DLQ machinery never change. Publishing/generation handlers
 * register here in later M11 increments (not now).
 */
const HANDLERS: Record<string, JobHandler> = {
  "analytics.ingest": analyticsIngestHandler,
};

export function getHandler(type: string): JobHandler | null {
  return HANDLERS[type] ?? null;
}

export function registeredJobTypes(): string[] {
  return Object.keys(HANDLERS);
}
