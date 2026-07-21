import "server-only";
import type { JobHandler } from "@/lib/jobs/types";
import { analyticsIngestHandler } from "@/lib/jobs/handlers/analytics";
import { generationRunHandler } from "@/lib/jobs/handlers/generation";
import { publishRunHandler } from "@/lib/jobs/handlers/publish";
import { workflowAdvanceHandler } from "@/lib/jobs/handlers/workflow";

/**
 * Job handler registry. Maps a job `type` to its real handler. Adding a durable
 * job type is ONE entry here + one handler — the engine, queue, lease, retry,
 * and DLQ machinery never change.
 *
 *  - analytics.ingest   real analytics ingestion (M11-1)
 *  - schedule.generate  scheduler-triggered generation (M11-2) — same handler
 *  - generation.run     generic durable generation (M11 Phase B)
 *  - publish.run        durable publication via the M10 adapter (Phase B)
 *  - workflow.advance   DAG coordination over durable jobs (Phase C)
 */
const HANDLERS: Record<string, JobHandler> = {
  "analytics.ingest": analyticsIngestHandler,
  "schedule.generate": generationRunHandler,
  "generation.run": generationRunHandler,
  "publish.run": publishRunHandler,
  "workflow.advance": workflowAdvanceHandler,
};

export function getHandler(type: string): JobHandler | null {
  return HANDLERS[type] ?? null;
}

export function registeredJobTypes(): string[] {
  return Object.keys(HANDLERS);
}
