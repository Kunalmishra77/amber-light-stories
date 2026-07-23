import "server-only";

/**
 * Render job coordination (web side).
 *
 * The render itself runs in the SEPARATE Python worker (FFmpeg + provider
 * adapters can't run on Vercel). The web app only ENQUEUES `render.run` and
 * lets the durable engine track it; the Python worker claims it, produces the
 * MP4, uploads it to the Storage bucket tenant-scoped, marks the render stage
 * done, and advances the pipeline. There is intentionally NO web-side handler —
 * `render.run` is excluded from the web worker's claim (see engine.ts).
 */

/** Deterministic idempotency key: one render job per pipeline run. */
export function renderJobKey(runId: string): string {
  return `render:run:${runId}`;
}

/**
 * A run renders for real once it has a text credential connected (real AI
 * generation happened) — the same signal the generation handler uses. Without
 * one, there is nothing worth rendering; the render stage stays parked.
 */
export async function shouldRender(tenantId: string): Promise<boolean> {
  try {
    const { resolveGenerationMode } = await import("@/lib/jobs/handlers/generation");
    return (await resolveGenerationMode(tenantId)) === "live";
  } catch {
    return false;
  }
}
