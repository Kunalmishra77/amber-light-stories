/**
 * Threat detection + risk scoring (M13 S3 — ADR-058). Rules and baselines over
 * signals the platform ALREADY records (failed logins, API request log, Vault
 * access, automation/job activity, device history). Every detector is a PURE
 * function that returns explainable evidence — nothing is inferred from an
 * external feed and nothing is invented.
 *
 * NOTE: impossible-travel detection is deliberately absent. It needs real
 * IP-geolocation data, which is not configured; inventing coordinates would be
 * fabricated intelligence. See `GATED_DETECTORS`.
 */

export type Severity = "info" | "warning" | "critical";

export interface Finding {
  detector: string;
  severity: Severity;
  title: string;
  evidence: Record<string, unknown>;
  recommendedAction: string;
}

/** Detectors that cannot run without an external dependency. */
export const GATED_DETECTORS: Record<string, string> = {
  impossible_travel: "an IP-geolocation provider (not configured) — no coordinates are ever invented",
};

export interface LoginSignal {
  userId: string;
  success: boolean;
  at: number; // epoch ms
  ip?: string | null;
  deviceFingerprint?: string | null;
}

export interface ApiSignal {
  apiKeyId: string;
  at: number;
  status: number;
  path?: string | null;
}

export interface SecretSignal {
  provider: string;
  actorId: string | null;
  at: number;
  outcome: "granted" | "denied";
}

export interface JobSignal {
  type: string;
  at: number;
  status: string; // succeeded|dead|failed
}

export interface DetectorThresholds {
  bruteForceAttempts: number;      // failed logins for ONE user in the window
  bruteForceWindowMs: number;
  stuffingDistinctUsers: number;   // distinct users failing from ONE ip
  apiErrorRate: number;            // 0..1 share of 4xx/5xx
  apiMinRequests: number;
  secretDenials: number;
  deadJobRate: number;             // 0..1 share of dead jobs
  jobMinCount: number;
}

export const DEFAULT_THRESHOLDS: DetectorThresholds = {
  bruteForceAttempts: 5,
  bruteForceWindowMs: 15 * 60 * 1000,
  stuffingDistinctUsers: 3,
  apiErrorRate: 0.5,
  apiMinRequests: 20,
  secretDenials: 3,
  deadJobRate: 0.5,
  jobMinCount: 10,
};

/** Repeated failed logins for a single account. */
export function detectBruteForce(logins: LoginSignal[], now: number, t = DEFAULT_THRESHOLDS): Finding[] {
  const since = now - t.bruteForceWindowMs;
  const byUser = new Map<string, LoginSignal[]>();
  for (const l of logins) {
    if (l.success || l.at < since) continue;
    byUser.set(l.userId, [...(byUser.get(l.userId) ?? []), l]);
  }
  const out: Finding[] = [];
  for (const [userId, fails] of byUser) {
    if (fails.length >= t.bruteForceAttempts) {
      out.push({
        detector: "brute_force",
        severity: fails.length >= t.bruteForceAttempts * 2 ? "critical" : "warning",
        title: `${fails.length} failed sign-ins for one account`,
        evidence: {
          userId,
          failedAttempts: fails.length,
          windowMinutes: Math.round(t.bruteForceWindowMs / 60000),
          distinctIps: Array.from(new Set(fails.map((f) => f.ip).filter(Boolean))).length,
        },
        recommendedAction: "Lock the account and require a password reset with step-up MFA.",
      });
    }
  }
  return out;
}

/** One source IP failing against MANY accounts = credential stuffing. */
export function detectCredentialStuffing(logins: LoginSignal[], now: number, t = DEFAULT_THRESHOLDS): Finding[] {
  const since = now - t.bruteForceWindowMs;
  const byIp = new Map<string, Set<string>>();
  for (const l of logins) {
    if (l.success || l.at < since || !l.ip) continue;
    byIp.set(l.ip, (byIp.get(l.ip) ?? new Set()).add(l.userId));
  }
  const out: Finding[] = [];
  for (const [ip, users] of byIp) {
    if (users.size >= t.stuffingDistinctUsers) {
      out.push({
        detector: "credential_stuffing",
        severity: "critical",
        title: `One address attacked ${users.size} accounts`,
        evidence: { ip, distinctUsersTargeted: users.size, windowMinutes: Math.round(t.bruteForceWindowMs / 60000) },
        recommendedAction: "Block the address and force step-up authentication for the targeted accounts.",
      });
    }
  }
  return out;
}

/** An API key producing mostly errors = probing/abuse. */
export function detectApiAbuse(signals: ApiSignal[], t = DEFAULT_THRESHOLDS): Finding[] {
  const byKey = new Map<string, ApiSignal[]>();
  for (const s of signals) byKey.set(s.apiKeyId, [...(byKey.get(s.apiKeyId) ?? []), s]);
  const out: Finding[] = [];
  for (const [apiKeyId, reqs] of byKey) {
    if (reqs.length < t.apiMinRequests) continue;
    const errors = reqs.filter((r) => r.status >= 400).length;
    const rate = errors / reqs.length;
    if (rate >= t.apiErrorRate) {
      out.push({
        detector: "api_abuse",
        severity: rate >= 0.9 ? "critical" : "warning",
        title: `API key error rate ${(rate * 100).toFixed(0)}%`,
        evidence: { apiKeyId, requests: reqs.length, errors, errorRate: Number(rate.toFixed(3)) },
        recommendedAction: "Rotate or revoke the key and review its recent calls.",
      });
    }
  }
  return out;
}

/** Repeated DENIED secret reads = secret abuse / privilege probing. */
export function detectSecretAbuse(signals: SecretSignal[], t = DEFAULT_THRESHOLDS): Finding[] {
  const denials = signals.filter((s) => s.outcome === "denied");
  if (denials.length < t.secretDenials) return [];
  return [
    {
      detector: "secret_abuse",
      severity: "critical",
      title: `${denials.length} denied credential reads`,
      evidence: {
        denials: denials.length,
        providers: Array.from(new Set(denials.map((d) => d.provider))),
        actors: Array.from(new Set(denials.map((d) => d.actorId).filter(Boolean))),
      },
      recommendedAction: "Investigate the actor and review Vault access policies.",
    },
  ];
}

/** Automation failing abnormally often = abuse or a compromised workflow. */
export function detectAbnormalAutomation(jobs: JobSignal[], t = DEFAULT_THRESHOLDS): Finding[] {
  if (jobs.length < t.jobMinCount) return [];
  const dead = jobs.filter((j) => j.status === "dead").length;
  const rate = dead / jobs.length;
  if (rate < t.deadJobRate) return [];
  return [
    {
      detector: "abnormal_automation",
      severity: "warning",
      title: `${(rate * 100).toFixed(0)}% of automation jobs dead-lettered`,
      evidence: { jobs: jobs.length, dead, deadRate: Number(rate.toFixed(3)) },
      recommendedAction: "Inspect the dead-letter queue and confirm the workload is legitimate.",
    },
  ];
}

/** First sign-in from an unseen device. */
export function detectNewDevice(logins: LoginSignal[], knownFingerprints: Set<string>): Finding[] {
  const out: Finding[] = [];
  const seen = new Set<string>();
  for (const l of logins) {
    if (!l.success || !l.deviceFingerprint) continue;
    if (knownFingerprints.has(l.deviceFingerprint) || seen.has(l.deviceFingerprint)) continue;
    seen.add(l.deviceFingerprint);
    out.push({
      detector: "new_device",
      severity: "info",
      title: "Sign-in from a new device",
      evidence: { userId: l.userId, deviceFingerprint: l.deviceFingerprint, ip: l.ip ?? null },
      recommendedAction: "Notify the account owner and offer to trust the device.",
    });
  }
  return out;
}

export interface DetectorInput {
  logins: LoginSignal[];
  api: ApiSignal[];
  secrets: SecretSignal[];
  jobs: JobSignal[];
  knownDevices: Set<string>;
  now: number;
  thresholds?: DetectorThresholds;
}

/** Run every ungated detector. */
export function runDetectors(input: DetectorInput): Finding[] {
  const t = input.thresholds ?? DEFAULT_THRESHOLDS;
  return [
    ...detectBruteForce(input.logins, input.now, t),
    ...detectCredentialStuffing(input.logins, input.now, t),
    ...detectApiAbuse(input.api, t),
    ...detectSecretAbuse(input.secrets, t),
    ...detectAbnormalAutomation(input.jobs, t),
    ...detectNewDevice(input.logins, input.knownDevices),
  ];
}

/* ------------------------------------------------------------------ */
/* Risk scoring (explainable, 0..100)                                  */
/* ------------------------------------------------------------------ */

const SEVERITY_WEIGHT: Record<Severity, number> = { info: 5, warning: 20, critical: 40 };

export interface RiskBreakdown {
  score: number;
  band: "low" | "moderate" | "high" | "critical";
  contributors: Array<{ source: string; points: number; detail: string }>;
}

/**
 * Compose a risk score from open findings plus posture facts. Explainable:
 * every point is attributed to a named contributor.
 */
export function computeRiskScore(input: {
  findings: Array<{ detector: string; severity: Severity }>;
  mfaEnabled: boolean;
  staleCredentials: number;
  openIncidents: number;
}): RiskBreakdown {
  const contributors: RiskBreakdown["contributors"] = [];
  let score = 0;

  for (const f of input.findings) {
    const pts = SEVERITY_WEIGHT[f.severity];
    score += pts;
    contributors.push({ source: `finding:${f.detector}`, points: pts, detail: `${f.severity} finding open` });
  }
  if (!input.mfaEnabled) {
    score += 15;
    contributors.push({ source: "posture:mfa", points: 15, detail: "MFA is not enabled" });
  }
  if (input.staleCredentials > 0) {
    const pts = Math.min(20, input.staleCredentials * 5);
    score += pts;
    contributors.push({ source: "posture:credentials", points: pts, detail: `${input.staleCredentials} credential(s) expired or overdue for rotation` });
  }
  if (input.openIncidents > 0) {
    const pts = Math.min(25, input.openIncidents * 10);
    score += pts;
    contributors.push({ source: "posture:incidents", points: pts, detail: `${input.openIncidents} open incident(s)` });
  }

  score = Math.max(0, Math.min(100, score));
  const band: RiskBreakdown["band"] =
    score >= 80 ? "critical" : score >= 50 ? "high" : score >= 25 ? "moderate" : "low";
  return { score, band, contributors };
}
