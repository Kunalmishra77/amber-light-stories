import "server-only";
import { runThroughGateway } from "@/lib/ai-gateway/gateway";
import type { ProviderKey } from "@/lib/providers/registry";
import type { TextGenerationInput, TextGenerationOutput } from "@/lib/ai-gateway/adapters/text";
import {
  CONTENT_PILLARS,
  planDates,
  type ContentPillar,
  type MockPlanItemDraft,
  type PlanTenantSettings,
} from "@/lib/planner/mock-plan";

const SYSTEM = `You are a YouTube Shorts content strategist. You plan a month of
short-form videos for ONE channel so that, taken together, the month builds an
audience rather than reading as thirty unrelated clips.

Rules you never break:
- Every topic is DIFFERENT. No two entries may be rewordings of each other.
- Each topic must be specific enough to film. "Kindness" is not a topic;
  "The merchant who refused payment from a blind beggar" is.
- The angle explains what makes THIS one worth watching — the hook, not a
  summary.
- Spread the pillars across the month; do not put all of one kind together.
- Write topics and angles in the channel's own language.
- Return JSON only. No prose, no markdown fences.`;

export interface LivePlanInput {
  tenantId: string;
  tenantSettings: PlanTenantSettings | null;
  scheduleDays?: number[] | null;
  count?: number;
  startDate?: Date;
  preferenceOrder?: ProviderKey[];
  /** Topics already in the plan. The model is told not to repeat them. */
  avoidTopics?: string[];
}

export interface LlmPlan {
  items?: { topic?: string; angle?: string; pillar?: string }[];
}

export function buildPlanPrompt(input: LivePlanInput, count: number): string {
  const s = input.tenantSettings;
  const keywords = (s?.keywords ?? []).filter(Boolean);
  const competitors = (s?.competitors ?? []).filter(Boolean);

  const lines = [
    `Plan ${count} short-form videos for a channel about: ${s?.industry || "short moral stories"}.`,
    `Language for all topics and angles: ${s?.language || "the channel's usual language"}.`,
  ];
  if (keywords.length) {
    lines.push(`Work these themes in naturally, not as labels: ${keywords.join(", ")}.`);
  }
  if (competitors.length) {
    lines.push(
      `These channels cover the same space: ${competitors.join(", ")}. ` +
        `Find angles they are NOT already known for.`
    );
  }
  const avoid = (input.avoidTopics ?? []).filter(Boolean);
  if (avoid.length) {
    lines.push(
      `This channel has ALREADY planned the topics below. Do not repeat them or ` +
        `produce near-duplicates:\n- ${avoid.slice(0, 60).join("\n- ")}`
    );
  }

  lines.push(
    `Assign each entry exactly one pillar from this list: ${CONTENT_PILLARS.join(", ")}.`,
    "",
    "Return JSON of exactly this shape:",
    `{"items":[{"topic":"...","angle":"...","pillar":"one of the pillars above"}]}`,
    `The items array must contain exactly ${count} entries.`
  );
  return lines.join("\n");
}

/** Models occasionally wrap JSON in prose or fences. */
function parsePlanJson(text: string): LlmPlan {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(trimmed) as LlmPlan;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as LlmPlan;
    }
    throw new Error("The model did not return valid JSON.");
  }
}

const PILLARS = new Set<string>(CONTENT_PILLARS);

function coercePillar(value: string | undefined, index: number): ContentPillar {
  const trimmed = (value ?? "").trim();
  if (PILLARS.has(trimmed)) return trimmed as ContentPillar;
  // Rotate rather than defaulting them all to one pillar — a month that is
  // entirely "Moral Fable" because the model free-typed its labels is worse
  // than a month whose labels are approximate.
  return CONTENT_PILLARS[index % CONTENT_PILLARS.length];
}

/**
 * A real, AI-researched month of topics for one workspace.
 *
 * The planner previously only ever produced a deterministic starter plan from
 * a fixed topic bank, which meant a client's "30-day plan" ignored their niche,
 * keywords and competitors entirely. This routes the same request through the
 * workspace's OWN text credential, exactly as story generation does.
 *
 * Dates come from `planDates`, the same walk the mock plan uses, so switching
 * to AI changes the topics and nothing about the calendar.
 *
 * Throws if the model returns nothing usable — the caller falls back to the
 * mock plan rather than showing an empty month.
 */
export async function generateLivePlanItems(
  input: LivePlanInput
): Promise<MockPlanItemDraft[]> {
  const count = input.count ?? 30;

  const response = await runThroughGateway<TextGenerationOutput>({
    capability: "text" as const,
    tenantId: input.tenantId,
    mode: "live" as const,
    input: {
      system: SYSTEM,
      prompt: buildPlanPrompt(input, count),
      json: true,
      // ~30 topic+angle pairs. Generous: a truncated response is unparseable
      // JSON, which costs the whole call.
      maxTokens: 3000,
      temperature: 0.9,
    } satisfies TextGenerationInput,
    stage: "topic",
    preferenceOrder: input.preferenceOrder,
  });

  return toPlanItems(parsePlanJson(response.output.text), input, count);
}

/**
 * Turns whatever the model returned into plan rows. Separated from the call
 * itself because this is where the failure modes live — a model that repeats a
 * topic, free-types a pillar, or returns twelve items when asked for thirty.
 */
export function toPlanItems(
  parsed: LlmPlan,
  input: Pick<LivePlanInput, "scheduleDays" | "startDate">,
  count: number
): MockPlanItemDraft[] {
  const raw = Array.isArray(parsed.items) ? parsed.items : [];

  // Keep only entries carrying a real topic, and drop duplicates the model
  // slipped in — a repeated topic becomes a repeated video.
  const seen = new Set<string>();
  const usable = raw.filter((item) => {
    const topic = (item?.topic ?? "").trim();
    if (!topic) return false;
    const key = topic.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (usable.length === 0) {
    throw new Error("The model returned no usable topics.");
  }

  // Never invent slots the model didn't fill: a short month is honest, a
  // padded one silently reintroduces the placeholder topics we just removed.
  const dates = planDates(
    Math.min(usable.length, count),
    input.scheduleDays,
    input.startDate ?? new Date()
  );

  return dates.map((date, i) => ({
    scheduled_date: date.toISOString().slice(0, 10),
    topic: (usable[i].topic ?? "").trim(),
    angle: (usable[i].angle ?? "").trim() || "Open with the moment of change.",
    pillar: coercePillar(usable[i].pillar, i),
    position: i,
    status: "planned" as const,
    locked: false as const,
  }));
}
