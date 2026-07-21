/**
 * Exponential retry backoff for the Job Engine (M11-1 / ADR-030). Pure and
 * dependency-free so the schedule is unit-testable. `attempt` is 1-based (the
 * attempt that just failed); the delay before the NEXT attempt is
 * base * 2^(attempt-1), capped.
 */
export function backoffMs(attempt: number, baseMs = 5000, capMs = 3_600_000): number {
  const a = Math.max(1, Math.floor(attempt));
  const raw = baseMs * 2 ** (a - 1);
  return Math.min(raw, capMs);
}

/** ISO timestamp `delay` ms after `fromMs` — the job's next `run_after`. */
export function nextRunAfter(attempt: number, fromMs: number, baseMs?: number, capMs?: number): string {
  return new Date(fromMs + backoffMs(attempt, baseMs, capMs)).toISOString();
}

/** Whether a job that just failed on `attempt` has exhausted its retries. */
export function isExhausted(attempt: number, maxAttempts: number): boolean {
  return attempt >= maxAttempts;
}
