import "server-only";
import type { JobHandler } from "@/lib/jobs/types";
import { analyticsIngestHandler } from "@/lib/jobs/handlers/analytics";
import { scheduleGenerateHandler } from "@/lib/jobs/handlers/schedule";

/**
 * Job handler registry. Maps a job `type` to its real handler. Adding a durable
 * job type is ONE entry here + one handler — the engine, queue, lease, retry,
 * and DLQ machinery never change.
 *  - analytics.ingest  (M11-1)
 *  - schedule.generate (M11-2 — durable scheduler execution)
 */
const HANDLERS: Record<string, JobHandler> = {
  "analytics.ingest": analyticsIngestHandler,
  "schedule.generate": scheduleGenerateHandler,
};

export function getHandler(type: string): JobHandler | null {
  return HANDLERS[type] ?? null;
}

export function registeredJobTypes(): string[] {
  return Object.keys(HANDLERS);
}
