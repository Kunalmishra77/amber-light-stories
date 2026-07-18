/**
 * Deterministic, $0 cost-planning helpers.
 *
 * Nothing here calls a paid API — it estimates what a story *would* cost to
 * finish generating, purely from data already sitting in the `scenes`
 * table (importance / recommended_quality / animate), using the benchmark
 * per-unit costs the cost governor is built around.
 */

/** Kling-master (premium motion) — the dominant line item per animated scene. */
export const MOTION_COST_USD = 0.35;
/** flux keyframe image accompanying an animated (HIGH) scene. */
export const HIGH_IMAGE_COST_USD = 0.035;
/** flux-schnell keyframe generated fresh for a MEDIUM scene (no motion). */
export const MEDIUM_IMAGE_COST_USD = 0.02;
/** LOW scenes reuse an existing/cached asset — no generation call at all. */
export const LOW_IMAGE_COST_USD = 0;

export const DEFAULT_BUDGET_USD = 1.55;

export interface SceneForCost {
  importance: string | null;
  motion_type?: string | null;
  recommended_quality: string | null;
  animate: boolean | null;
}

/** Planned cost for one scene, derived from its decision-engine fields. */
export function sceneCost(scene: SceneForCost): number {
  if (scene.animate) return MOTION_COST_USD + HIGH_IMAGE_COST_USD;
  if ((scene.recommended_quality ?? "").toLowerCase() === "medium") {
    return MEDIUM_IMAGE_COST_USD;
  }
  return LOW_IMAGE_COST_USD;
}

/** What this scene would cost if the pipeline naively animated everything. */
export function naiveSceneCost(): number {
  return MOTION_COST_USD + HIGH_IMAGE_COST_USD;
}

export function normalizeImportance(value: string | null): "HIGH" | "MEDIUM" | "LOW" {
  const upper = (value ?? "").toUpperCase();
  if (upper === "HIGH" || upper === "MEDIUM" || upper === "LOW") return upper;
  return "LOW";
}

export function formatUsd(value: number, digits = 2): string {
  return `$${value.toFixed(digits)}`;
}
