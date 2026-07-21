/**
 * Compliance / Safety rule engine (M12 G3 — ADR-044). Explicit gates run
 * PRE-RENDER and PRE-PUBLISH; violations block and are explainable.
 *
 * Rules-based and deterministic — no paid classifier is called. An AI
 * classifier tier is a later authorized addition; `evaluator` records the tier
 * so a rules verdict is never presented as an AI verdict. Pure + testable.
 */

export type ComplianceGate = "pre_render" | "pre_publish";
export type Severity = "info" | "warning" | "blocking";
export type ComplianceStatus = "passed" | "manual_review" | "blocked";

export interface ComplianceFinding {
  rule: string;
  severity: Severity;
  message: string;
  evidence?: string;
}

export interface ComplianceInput {
  gate: ComplianceGate;
  story: { topic: string | null; logline: string | null; moral: string | null };
  scenes: Array<{ id?: string; narration: string | null; subtitle: string | null }>;
  seo?: { title?: string | null; description?: string | null; tags?: string[] | null } | null;
  /** Stricter defaults for sensitive audiences (ADR-044). */
  audienceMode?: "general" | "kids" | "news";
  bannedTerms?: string[];
  /** Whether the tenant recorded consent/rights for likeness usage (Part 4). */
  likenessConsent?: boolean;
  /** True when any asset used is flagged as third-party/unlicensed. */
  hasUnlicensedAssets?: boolean;
  /** Whether the content is AI-generated (disclosure rule). */
  aiGenerated?: boolean;
}

export interface ComplianceResult {
  gate: ComplianceGate;
  status: ComplianceStatus;
  findings: ComplianceFinding[];
  blockingCount: number;
  evaluator: "rules";
}

const UNSAFE_TERMS = ["gore", "self-harm", "suicide", "explicit sexual", "graphic violence"];
const KIDS_EXTRA_TERMS = ["violence", "weapon", "gambling", "alcohol", "horror"];
const NEWS_CLAIM_MARKERS = ["breaking", "confirmed", "exclusive", "official"];

function corpusOf(i: ComplianceInput): string {
  return [
    i.story.topic ?? "",
    i.story.logline ?? "",
    i.story.moral ?? "",
    ...i.scenes.map((s) => `${s.narration ?? ""} ${s.subtitle ?? ""}`),
    i.seo?.title ?? "",
    i.seo?.description ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

/** Evaluate every rule for the gate. Deterministic and fully explainable. */
export function evaluateCompliance(input: ComplianceInput): ComplianceResult {
  const findings: ComplianceFinding[] = [];
  const corpus = corpusOf(input);

  // 1) Unsafe content (all gates, all audiences)
  const banned = [...UNSAFE_TERMS, ...(input.bannedTerms ?? [])].map((t) => t.toLowerCase()).filter(Boolean);
  const hits = Array.from(new Set(banned.filter((t) => corpus.includes(t))));
  if (hits.length > 0) {
    findings.push({
      rule: "unsafe_content",
      severity: "blocking",
      message: "Content contains terms that violate the safety policy.",
      evidence: hits.join(", "),
    });
  }

  // 2) Audience-specific strictness
  if (input.audienceMode === "kids") {
    const kidHits = KIDS_EXTRA_TERMS.filter((t) => corpus.includes(t));
    if (kidHits.length > 0) {
      findings.push({
        rule: "kids_audience_strict",
        severity: "blocking",
        message: "Content is not suitable for a kids audience.",
        evidence: kidHits.join(", "),
      });
    }
  }
  if (input.audienceMode === "news") {
    const claims = NEWS_CLAIM_MARKERS.filter((t) => corpus.includes(t));
    if (claims.length > 0) {
      findings.push({
        rule: "news_claim_review",
        severity: "warning",
        message: "Assertive news framing requires human verification before publish.",
        evidence: claims.join(", "),
      });
    }
  }

  // 3) Likeness / consent (Part 4 rights capture)
  if (input.likenessConsent === false) {
    findings.push({
      rule: "likeness_consent_missing",
      severity: "blocking",
      message: "Likeness usage requires recorded consent/rights.",
    });
  }

  // 4) Asset licensing
  if (input.hasUnlicensedAssets) {
    findings.push({
      rule: "unlicensed_asset",
      severity: "blocking",
      message: "One or more assets are not cleared for use.",
    });
  }

  // 5) Publish-time-only rules
  if (input.gate === "pre_publish") {
    const title = (input.seo?.title ?? "").trim();
    const description = (input.seo?.description ?? "").trim();
    if (!title || !description) {
      findings.push({
        rule: "publish_metadata_incomplete",
        severity: "blocking",
        message: "Title and description are required before publishing.",
        evidence: `title:${title ? "ok" : "missing"} description:${description ? "ok" : "missing"}`,
      });
    }
    if (input.aiGenerated) {
      // Disclosure is a policy warning today; platforms are tightening this.
      findings.push({
        rule: "ai_disclosure",
        severity: "info",
        message: "AI-generated content — ensure platform AI disclosure is set.",
      });
    }
  }

  // 6) Empty content can never pass a gate
  if (input.scenes.length === 0) {
    findings.push({
      rule: "no_content",
      severity: "blocking",
      message: "There is no scene content to evaluate.",
    });
  }

  const blockingCount = findings.filter((f) => f.severity === "blocking").length;
  const warningCount = findings.filter((f) => f.severity === "warning").length;
  const status: ComplianceStatus =
    blockingCount > 0 ? "blocked" : warningCount > 0 ? "manual_review" : "passed";

  return { gate: input.gate, status, findings, blockingCount, evaluator: "rules" };
}
