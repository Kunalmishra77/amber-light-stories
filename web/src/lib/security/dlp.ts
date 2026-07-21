/**
 * DLP + data classification handling (M13 S5). Deterministic pattern rules
 * over content that is about to leave the platform (exports, API responses,
 * downloads). Pure — no external classifier, no AI.
 *
 * Evidence records match COUNTS and locations, never the matched secret.
 */

export type DlpSeverity = "info" | "warning" | "blocking";
export type ClassificationLevel = "public" | "internal" | "confidential" | "restricted" | "secret";

export interface DlpMatch {
  rule: string;
  severity: DlpSeverity;
  count: number;
  sample?: string; // redacted preview only
}

export interface DlpResult {
  matches: DlpMatch[];
  blocking: boolean;
  action: "allow" | "redact" | "block";
}

/** Redact all but the first/last 2 characters — never echo a secret. */
export function redact(value: string): string {
  if (value.length <= 8) return "*".repeat(value.length);
  return `${value.slice(0, 2)}${"*".repeat(Math.max(4, value.length - 4))}${value.slice(-2)}`;
}

const RULES: Array<{ rule: string; severity: DlpSeverity; re: RegExp }> = [
  // Provider/secret shapes — blocking: a live key must never leave in an export.
  { rule: "secret_openai_key", severity: "blocking", re: /\bsk-[A-Za-z0-9]{20,}\b/g },
  { rule: "secret_platform_api_key", severity: "blocking", re: /\bak_live_[0-9a-f]{8}_[0-9a-f]{16,}\b/g },
  { rule: "secret_webhook_signing", severity: "blocking", re: /\bwhsec_[0-9a-f]{16,}\b/g },
  { rule: "secret_bearer_token", severity: "blocking", re: /\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { rule: "secret_private_key", severity: "blocking", re: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g },
  // PII — warning: allowed but recorded, and redactable on request.
  { rule: "pii_email", severity: "warning", re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { rule: "pii_phone", severity: "warning", re: /\b\+?\d[\d\s().-]{8,}\d\b/g },
  { rule: "pii_credit_card", severity: "blocking", re: /\b(?:\d[ -]*?){13,16}\b/g },
];

/** Scan text for secrets/PII. Deterministic and side-effect free. */
export function scanForSensitiveData(text: string): DlpResult {
  const matches: DlpMatch[] = [];
  for (const { rule, severity, re } of RULES) {
    const found = text.match(new RegExp(re.source, re.flags));
    if (found && found.length > 0) {
      matches.push({ rule, severity, count: found.length, sample: redact(found[0]) });
    }
  }
  const blocking = matches.some((m) => m.severity === "blocking");
  return {
    matches,
    blocking,
    action: blocking ? "block" : matches.length > 0 ? "redact" : "allow",
  };
}

const LEVEL_RANK: Record<ClassificationLevel, number> = {
  public: 0, internal: 1, confidential: 2, restricted: 3, secret: 4,
};

/**
 * Whether a resource at `level` may leave through `channel`, given its
 * handling rules. `secret` never leaves, by construction.
 */
export function isExportAllowed(
  level: ClassificationLevel,
  handling: { export?: boolean; share?: boolean } | null | undefined,
  channel: "export" | "api" | "download" | "webhook"
): { allowed: boolean; reason: string } {
  if (level === "secret") {
    return { allowed: false, reason: "secret-classified data can never be exported" };
  }
  if (handling?.export === false) {
    return { allowed: false, reason: `handling rules forbid export of ${level} data` };
  }
  if (channel === "webhook" && LEVEL_RANK[level] >= LEVEL_RANK.restricted) {
    return { allowed: false, reason: "restricted data may not be sent to external webhooks" };
  }
  return { allowed: true, reason: `${level} data is permitted on the ${channel} channel` };
}

/** Retention verdict for a record of a given age. */
export function isRetentionExpired(ageDays: number, retentionDays: number | null): boolean {
  if (retentionDays === null || retentionDays === undefined) return false;
  return ageDays > retentionDays;
}
