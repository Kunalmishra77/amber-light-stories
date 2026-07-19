/**
 * Deterministic MOCK content-plan generator. $0 — no AI / paid API calls.
 *
 * "Deterministic" here means the algorithm is pure rotation + hashing over
 * inputs (tenant id, index, tenant settings) — never a network call. Two
 * calls with the same inputs are stable; regenerating a single item nudges
 * the seed so it varies without touching anything paid.
 *
 * Real AI-researched planning is a paid step gated for a later phase.
 */

export const CONTENT_PILLARS = [
  "Moral Fable",
  "Character Spotlight",
  "Wisdom Short",
  "Cultural Tale",
  "Life Lesson",
] as const;

export type ContentPillar = (typeof CONTENT_PILLARS)[number];

const ANGLE_TEMPLATES: Record<ContentPillar, string[]> = {
  "Moral Fable": [
    "A classic retold with a modern twist",
    "Animals teach a timeless lesson",
    "A short fable with a surprise ending",
    "The fable, told from the villain's side",
  ],
  "Character Spotlight": [
    "Meet the clever protagonist",
    "The rivalry between two characters",
    "A character's turning point",
    "The unsung side character who saves the day",
  ],
  "Wisdom Short": [
    "One line of wisdom, unpacked",
    "A proverb brought to life",
    "Ancient wisdom for a modern problem",
    "Three takeaways in under a minute",
  ],
  "Cultural Tale": [
    "A festival legend explained",
    "Folklore from a regional tradition",
    "A tale passed down generations",
    "The story behind a common saying",
  ],
  "Life Lesson": [
    "A lesson in patience",
    "A lesson in honesty",
    "A lesson in courage",
    "A lesson learned the hard way",
  ],
};

const TOPIC_BANK = [
  "The Clever Fox and the Drum",
  "The Farmer and the Golden Goose",
  "The Ant and the Grasshopper, Revisited",
  "The Thirsty Crow's Clever Trick",
  "The Tortoise Who Outsmarted the Hare",
  "The Monkey and the Crocodile",
  "The Brahmin and the Four Fools",
  "The Lion, the Mouse, and the Hunter's Net",
  "The Foolish Merchant and the Wise Old Owl",
  "The Jackal Who Turned Blue",
  "The Elephant and the Six Blind Men",
  "The Two Friends and the Bear",
  "The Woodcutter's Honest Wish",
  "The Golden Deer's Warning",
  "The Talking Cave",
  "The Weaver Who Became a King",
  "The Turtle and the Geese",
  "The Greedy Dog and the Bone",
  "The Wise Minister's Riddle",
  "The Milkmaid and Her Pail of Dreams",
  "The Camel's First Journey",
  "The Peacock Who Envied the Swan",
  "The Potter's Broken Wheel",
  "The Snake and the Garland of Flowers",
  "The King Who Learned to Listen",
  "The Parrot Who Spoke Too Much",
  "The Farmer's Three Sons and the Bundle of Sticks",
  "The Blind Men and the Elephant",
  "The Crow and the Pitcher of Water",
  "The Mongoose and the Farmer's Baby",
  "The Stonecutter's Wish",
  "The Wise Old Turtle's Shell",
  "The Fisherman and the Magic Fish",
  "The Shepherd Boy Who Cried Wolf",
  "The Two Pots, One Cracked and One Whole",
];

export interface PlanTenantSettings {
  industry?: string | null;
  keywords?: string[] | null;
  competitors?: string[] | null;
  language?: string | null;
}

export interface MockPlanItemDraft {
  scheduled_date: string; // YYYY-MM-DD
  topic: string;
  angle: string;
  pillar: ContentPillar;
  position: number;
  status: "planned";
  locked: false;
}

/** Simple non-cryptographic string hash — good enough for a stable seed. */
export function simpleHash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h;
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Builds one mock plan item for absolute index `idx` (0-based across the
 * whole plan) on `date`, seeded by `seed`. Pure function — no I/O.
 */
function buildItem(
  idx: number,
  date: Date,
  seed: number,
  settings: PlanTenantSettings | null
): MockPlanItemDraft {
  const pillar = CONTENT_PILLARS[(idx + Math.floor(seed / 7)) % CONTENT_PILLARS.length];
  const angles = ANGLE_TEMPLATES[pillar];
  const angle = angles[(idx + seed) % angles.length];

  const topicBase = TOPIC_BANK[(idx + seed) % TOPIC_BANK.length];
  const keywords = (settings?.keywords ?? []).filter(Boolean);
  const useKeyword = keywords.length > 0 && idx % 4 === 0;
  const topic = useKeyword
    ? `${topicBase} — ${keywords[idx % keywords.length]} angle`
    : topicBase;

  return {
    scheduled_date: toDateKey(date),
    topic,
    angle,
    pillar,
    position: idx,
    status: "planned",
    locked: false,
  };
}

export interface GeneratePlanOptions {
  tenantId: string;
  tenantSettings: PlanTenantSettings | null;
  /** JS Date.getDay() values (0=Sun..6=Sat) the schedule allows. Empty/undefined = every day. */
  scheduleDays?: number[] | null;
  count?: number;
  startDate?: Date;
}

/**
 * Walks forward day by day from tomorrow, skipping any day of week not in
 * `scheduleDays`, until `count` items are placed. Guarantees exactly
 * `count` items even for a sparse schedule (guarded against runaway loops).
 */
export function generateMockPlanItems(
  options: GeneratePlanOptions
): MockPlanItemDraft[] {
  const { tenantId, tenantSettings, scheduleDays, count = 30, startDate = new Date() } =
    options;

  const seed = simpleHash(tenantId);
  const allowedDays =
    scheduleDays && scheduleDays.length > 0 ? new Set(scheduleDays) : null;

  const items: MockPlanItemDraft[] = [];
  const cursor = new Date(
    Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate())
  );
  cursor.setUTCDate(cursor.getUTCDate() + 1); // start tomorrow

  let guard = 0;
  while (items.length < count && guard < 400) {
    guard++;
    const dow = cursor.getUTCDay();
    if (!allowedDays || allowedDays.has(dow)) {
      items.push(buildItem(items.length, cursor, seed, tenantSettings));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return items;
}

/**
 * Re-mocks a single item at a fixed date/position — used by the
 * "regenerate" per-item action. Nudges the seed with a variant so the
 * result differs from the original without any paid call.
 */
export function regenerateMockItem(
  tenantId: string,
  position: number,
  scheduledDate: string,
  tenantSettings: PlanTenantSettings | null,
  variant = 1
): Pick<MockPlanItemDraft, "topic" | "angle" | "pillar"> {
  const seed = simpleHash(`${tenantId}:${variant}:${Date.now()}`);
  const date = new Date(`${scheduledDate}T00:00:00Z`);
  const item = buildItem(position, date, seed, tenantSettings);
  return { topic: item.topic, angle: item.angle, pillar: item.pillar };
}

/** Month key (YYYY-MM) for the content_plans.month column, from the first item's date. */
export function planMonthFromItems(items: MockPlanItemDraft[]): string {
  return items[0]?.scheduled_date.slice(0, 7) ?? new Date().toISOString().slice(0, 7);
}
