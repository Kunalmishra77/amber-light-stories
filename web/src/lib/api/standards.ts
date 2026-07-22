/**
 * API standards (M14 B3 — ADR-072). Uniform pagination, filtering, sorting,
 * idempotency and deprecation semantics for every `/api/v1` route. Pure and
 * dependency-free so the rules are unit-testable and identical everywhere.
 *
 * These EXTEND the existing M8 `authenticateRequest` path — they do not replace
 * or duplicate the authentication/rate-limit gateway.
 */

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 25;
export const IDEMPOTENCY_HEADER = "idempotency-key";

export interface PageRequest {
  limit: number;
  offset: number;
  cursor: string | null;
}

/** Parse pagination with hard bounds; never trust caller-supplied sizes. */
export function parsePagination(params: URLSearchParams): PageRequest {
  const rawLimit = Number(params.get("limit") ?? DEFAULT_PAGE_SIZE);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(rawLimit)))
    : DEFAULT_PAGE_SIZE;
  const rawOffset = Number(params.get("offset") ?? 0);
  const offset = Number.isFinite(rawOffset) ? Math.max(0, Math.floor(rawOffset)) : 0;
  return { limit, offset, cursor: params.get("cursor") };
}

export interface SortSpec {
  field: string;
  direction: "asc" | "desc";
}

/**
 * Parse `sort=-created_at` style input against an ALLOWLIST. An unknown field
 * is rejected rather than passed to the database (injection-safe by design).
 */
export function parseSort(
  params: URLSearchParams,
  allowed: string[],
  fallback: SortSpec
): { sort: SortSpec; rejected: string | null } {
  const raw = params.get("sort");
  if (!raw) return { sort: fallback, rejected: null };
  const direction: "asc" | "desc" = raw.startsWith("-") ? "desc" : "asc";
  const field = raw.replace(/^[-+]/, "");
  if (!allowed.includes(field)) return { sort: fallback, rejected: field };
  return { sort: { field, direction }, rejected: null };
}

export interface FilterSpec {
  field: string;
  value: string;
}

/** Parse `filter[status]=published` against an allowlist. */
export function parseFilters(params: URLSearchParams, allowed: string[]): FilterSpec[] {
  const out: FilterSpec[] = [];
  for (const [key, value] of params.entries()) {
    const m = /^filter\[([a-zA-Z0-9_]+)\]$/.exec(key);
    if (!m) continue;
    if (!allowed.includes(m[1])) continue;
    out.push({ field: m[1], value });
  }
  return out;
}

/** Uniform envelope so every collection response looks the same. */
export function buildPageEnvelope<T>(
  items: T[],
  page: PageRequest,
  apiVersion: string
): {
  api_version: string;
  data: T[];
  pagination: { limit: number; offset: number; count: number; has_more: boolean };
} {
  return {
    api_version: apiVersion,
    data: items,
    pagination: {
      limit: page.limit,
      offset: page.offset,
      count: items.length,
      has_more: items.length === page.limit,
    },
  };
}

/**
 * Deprecation/sunset headers (RFC-style). A caller learns a version is going
 * away from the response itself, long before it breaks.
 */
export function deprecationHeaders(input: {
  deprecated?: boolean;
  sunsetAt?: string | null;
  successorPath?: string | null;
}): Record<string, string> {
  const headers: Record<string, string> = {};
  if (input.deprecated) headers["Deprecation"] = "true";
  if (input.sunsetAt) headers["Sunset"] = new Date(input.sunsetAt).toUTCString();
  if (input.successorPath) headers["Link"] = `<${input.successorPath}>; rel="successor-version"`;
  return headers;
}

export interface ValidationIssue {
  field: string;
  message: string;
}

/**
 * Minimal declarative request validation — enough to reject malformed writes
 * uniformly without pulling in a schema library.
 */
export function validateBody(
  body: Record<string, unknown>,
  rules: Record<string, { required?: boolean; type?: "string" | "number" | "boolean" | "object"; maxLength?: number }>
): { valid: boolean; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  for (const [field, rule] of Object.entries(rules)) {
    const value = body[field];
    if (rule.required && (value === undefined || value === null || value === "")) {
      issues.push({ field, message: "is required" });
      continue;
    }
    if (value === undefined || value === null) continue;
    if (rule.type && typeof value !== rule.type) {
      issues.push({ field, message: `must be a ${rule.type}` });
      continue;
    }
    if (rule.maxLength && typeof value === "string" && value.length > rule.maxLength) {
      issues.push({ field, message: `must be at most ${rule.maxLength} characters` });
    }
  }
  return { valid: issues.length === 0, issues };
}

/** The write-idempotency key a client sends; scoped per key+route by callers. */
export function idempotencyKeyFrom(headers: Headers): string | null {
  const raw = headers.get(IDEMPOTENCY_HEADER);
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 && trimmed.length <= 200 ? trimmed : null;
}
