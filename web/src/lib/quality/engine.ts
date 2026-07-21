/**
 * Quality Engine (M12 G3 — ADR-042). EXPLAINABLE, RULES-BASED and fully
 * deterministic: every dimension is computed from real story/scene/format data
 * that already exists, and every score carries the evidence that produced it.
 *
 * This is the `rules` evaluator tier. A pluggable AI-evaluator tier is a later,
 * authorized addition — scores record which tier produced them so an AI score
 * can never be mistaken for a rules score. Nothing here calls a paid provider.
 *
 * Pure (no DB, no server-only) so the scoring is unit-testable in isolation.
 */

export interface QualityDimensionConfig {
  key: string;
  label: string;
  weight: number;
  min_score: number;
  blocking: boolean;
}

export interface QualityInput {
  story: { topic: string | null; logline: string | null; moral: string | null; duration_seconds: number | null };
  scenes: Array<{
    id?: string;
    seq: number | null;
    narration: string | null;
    subtitle: string | null;
    start_sec: number | null;
    end_sec: number | null;
    /** Only `subject` is read (continuity); any prompt shape is accepted. */
    prompt?: unknown;
  }>;
  format: { target_seconds: number | null; min_seconds: number | null; max_seconds: number | null; scene_budget: number | null };
  seo?: { title?: string | null; description?: string | null; tags?: string[] | null } | null;
  brand?: { voice_tone?: string | null; display_name?: string | null } | null;
  /** Terms that must never appear (tenant + platform safety rules). */
  bannedTerms?: string[];
}

export interface DimensionScore {
  key: string;
  label: string;
  score: number;      // 0..1
  weight: number;
  min: number;
  passed: boolean;
  blocking: boolean;
  evidence: string;
  /** Scenes implicated — drives narrowest-scope regeneration. */
  sceneIds?: string[];
}

export type QualityAction = "proceed" | "regenerate_partial" | "regenerate_full" | "manual_review" | "block";

export interface QualityResult {
  overall: number;
  passed: boolean;
  action: QualityAction;
  dimensions: DimensionScore[];
  regenerateScope: { stage?: string; sceneIds?: string[]; reason?: string };
  evaluator: "rules";
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Default safety vocabulary; tenants extend it via `bannedTerms`. */
export const DEFAULT_BANNED_TERMS = ["gore", "self-harm", "suicide", "explicit sexual"];

function scoreScriptCompleteness(i: QualityInput): Omit<DimensionScore, "key" | "label" | "weight" | "min" | "passed" | "blocking"> {
  const total = i.scenes.length;
  if (total === 0) return { score: 0, evidence: "No scenes present.", sceneIds: [] };
  const empty = i.scenes.filter((s) => !(s.narration ?? "").trim());
  const score = clamp01((total - empty.length) / total);
  return {
    score,
    evidence: `${total - empty.length}/${total} scenes have narration.`,
    sceneIds: empty.map((s) => s.id).filter((x): x is string => Boolean(x)),
  };
}

function scoreSceneCoverage(i: QualityInput) {
  const budget = i.format.scene_budget ?? 0;
  const total = i.scenes.length;
  if (!budget) return { score: total > 0 ? 1 : 0, evidence: `No scene budget configured; ${total} scenes.` };
  // Full credit within budget; degrade proportionally when short or over.
  const ratio = total / budget;
  const score = clamp01(ratio > 1 ? Math.max(0, 1 - (ratio - 1)) : ratio);
  return { score, evidence: `${total} scenes vs budget ${budget}.` };
}

function scoreDurationFit(i: QualityInput) {
  const declared = i.story.duration_seconds ?? null;
  const derived = i.scenes.reduce((m, s) => Math.max(m, s.end_sec ?? 0), 0);
  const actual = declared ?? derived;
  const min = i.format.min_seconds ?? null;
  const max = i.format.max_seconds ?? null;
  const target = i.format.target_seconds ?? null;
  if (!actual) return { score: 0, evidence: "No duration available." };
  if (min !== null && actual < min) return { score: clamp01(actual / min), evidence: `${actual}s is below the ${min}s minimum.` };
  if (max !== null && actual > max) return { score: clamp01(max / actual), evidence: `${actual}s exceeds the ${max}s maximum.` };
  if (target) {
    const drift = Math.abs(actual - target) / target;
    return { score: clamp01(1 - drift), evidence: `${actual}s vs ${target}s target.` };
  }
  return { score: 1, evidence: `${actual}s within format bounds.` };
}

function scoreSeoCompleteness(i: QualityInput) {
  const seo = i.seo ?? {};
  const title = (seo.title ?? "").trim();
  const desc = (seo.description ?? "").trim();
  const tags = seo.tags ?? [];
  let got = 0;
  const parts: string[] = [];
  if (title.length >= 10) { got++; parts.push("title"); }
  if (desc.length >= 40) { got++; parts.push("description"); }
  if (tags.length >= 3) { got++; parts.push(`${tags.length} tags`); }
  return { score: clamp01(got / 3), evidence: parts.length ? `Present: ${parts.join(", ")}.` : "No SEO metadata." };
}

function scoreBrandAlignment(i: QualityInput) {
  const tone = (i.brand?.voice_tone ?? "").toLowerCase();
  if (!tone.trim()) return { score: 0.5, evidence: "No brand voice configured — neutral score." };
  const keywords = tone.split(/[^a-z]+/).filter((w) => w.length > 4);
  if (keywords.length === 0) return { score: 0.5, evidence: "Brand voice has no usable keywords — neutral score." };
  const corpus = i.scenes.map((s) => (s.narration ?? "").toLowerCase()).join(" ");
  const hits = keywords.filter((k) => corpus.includes(k));
  return {
    score: clamp01(hits.length / Math.min(keywords.length, 3)),
    evidence: `${hits.length}/${keywords.length} brand-voice cues present.`,
  };
}

function scoreContinuity(i: QualityInput) {
  const withSubject = i.scenes.filter((s) => {
    const p = (s.prompt ?? {}) as { subject?: string };
    return Boolean((p.subject ?? "").trim());
  });
  const total = i.scenes.length;
  if (total === 0) return { score: 0, evidence: "No scenes." };
  return {
    score: clamp01(withSubject.length / total),
    evidence: `${withSubject.length}/${total} scenes name a subject/character.`,
    sceneIds: i.scenes.filter((s) => !withSubject.includes(s)).map((s) => s.id).filter((x): x is string => Boolean(x)),
  };
}

function scoreSafety(i: QualityInput) {
  const banned = [...DEFAULT_BANNED_TERMS, ...(i.bannedTerms ?? [])].map((t) => t.toLowerCase()).filter(Boolean);
  const offending: string[] = [];
  const sceneIds: string[] = [];
  for (const s of i.scenes) {
    const text = `${s.narration ?? ""} ${s.subtitle ?? ""}`.toLowerCase();
    for (const term of banned) {
      if (term && text.includes(term)) {
        offending.push(term);
        if (s.id) sceneIds.push(s.id);
      }
    }
  }
  const topic = `${i.story.topic ?? ""} ${i.story.logline ?? ""}`.toLowerCase();
  for (const term of banned) if (term && topic.includes(term)) offending.push(term);

  return {
    score: offending.length === 0 ? 1 : 0,
    evidence: offending.length === 0 ? "No banned terms detected." : `Banned terms: ${Array.from(new Set(offending)).join(", ")}.`,
    sceneIds: Array.from(new Set(sceneIds)),
  };
}

const SCORERS: Record<string, (i: QualityInput) => { score: number; evidence: string; sceneIds?: string[] }> = {
  script_completeness: scoreScriptCompleteness,
  scene_coverage: scoreSceneCoverage,
  duration_fit: scoreDurationFit,
  seo_completeness: scoreSeoCompleteness,
  brand_alignment: scoreBrandAlignment,
  continuity: scoreContinuity,
  safety: scoreSafety,
};

/**
 * Score every configured dimension, then decide the NARROWEST corrective
 * action (ADR-042): partial regeneration where the failure is scene-local,
 * full regeneration when it is structural, manual review when a blocking
 * dimension fails.
 */
export function evaluateQuality(
  input: QualityInput,
  configs: QualityDimensionConfig[]
): QualityResult {
  const dimensions: DimensionScore[] = [];

  for (const cfg of configs) {
    const scorer = SCORERS[cfg.key];
    if (!scorer) continue;
    const { score, evidence, sceneIds } = scorer(input);
    dimensions.push({
      key: cfg.key,
      label: cfg.label,
      score: Number(score.toFixed(4)),
      weight: cfg.weight,
      min: cfg.min_score,
      passed: score >= cfg.min_score,
      blocking: cfg.blocking,
      evidence,
      sceneIds,
    });
  }

  const totalWeight = dimensions.reduce((s, d) => s + d.weight, 0) || 1;
  const overall = Number(
    (dimensions.reduce((s, d) => s + d.score * d.weight, 0) / totalWeight).toFixed(4)
  );

  const failed = dimensions.filter((d) => !d.passed);
  const blockingFailed = failed.filter((d) => d.blocking);
  const passed = failed.length === 0;

  let action: QualityAction = "proceed";
  let regenerateScope: QualityResult["regenerateScope"] = {};

  if (blockingFailed.length > 0) {
    // High-stakes dimensions never auto-proceed and never auto-regenerate.
    action = "manual_review";
    regenerateScope = { reason: `Blocking dimension failed: ${blockingFailed.map((d) => d.key).join(", ")}` };
  } else if (failed.length > 0) {
    const sceneLocal = failed.filter((d) => (d.sceneIds?.length ?? 0) > 0);
    const structural = failed.filter((d) => (d.sceneIds?.length ?? 0) === 0);
    if (sceneLocal.length > 0 && structural.length === 0) {
      const sceneIds = Array.from(new Set(sceneLocal.flatMap((d) => d.sceneIds ?? [])));
      action = "regenerate_partial";
      regenerateScope = { stage: "script", sceneIds, reason: `Scene-local failures: ${sceneLocal.map((d) => d.key).join(", ")}` };
    } else {
      action = "regenerate_full";
      regenerateScope = { reason: `Structural failures: ${failed.map((d) => d.key).join(", ")}` };
    }
  }

  return { overall, passed, action, dimensions, regenerateScope, evaluator: "rules" };
}
