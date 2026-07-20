import type { RoutePolicy } from "@/lib/ai-gateway/types";

/**
 * Retry / timeout policy engine for the AI Gateway (ISS-P2-06). Pure and
 * dependency-free (sleep is injectable) so the retry/backoff/timeout behaviour
 * is fully unit-testable. Provider-independent: it wraps ANY async operation.
 */

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Operation timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

/** Reject if `promise` doesn't settle within `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  if (ms <= 0) return promise;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

export interface AttemptResult<T> {
  value: T;
  attempts: number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Run `fn` under a policy: up to `retries + 1` attempts, each bounded by
 * `timeoutMs`, with exponential backoff (`backoffMs * 2^n`) between them.
 * Throws the last error if all attempts fail. `sleep` is injectable for tests.
 */
export async function executeWithPolicy<T>(
  fn: (attempt: number) => Promise<T>,
  policy: Pick<RoutePolicy, "retries" | "timeoutMs" | "backoffMs">,
  sleep: (ms: number) => Promise<void> = defaultSleep
): Promise<AttemptResult<T>> {
  const maxAttempts = Math.max(1, policy.retries + 1);
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const value = await withTimeout(fn(attempt), policy.timeoutMs);
      return { value, attempts: attempt };
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await sleep(policy.backoffMs * 2 ** (attempt - 1));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Operation failed");
}
