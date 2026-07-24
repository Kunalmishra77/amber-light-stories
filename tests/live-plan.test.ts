/**
 * The AI content planner.
 *
 * The planner used to serve every workspace the same deterministic topic bank,
 * so a client's "30-day plan" ignored their niche, keywords and competitors.
 * These tests cover the part that decides what actually lands in the calendar —
 * the model's output is untrusted input, and everything here is a way it has
 * to be wrong without breaking the month.
 *
 * Run: node --experimental-strip-types --import ./tests/security/loader.mjs \
 *        ./tests/live-plan.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { buildPlanPrompt, toPlanItems } from "@/lib/planner/live-plan";
import { CONTENT_PILLARS } from "@/lib/planner/mock-plan";

const START = new Date("2026-08-01T00:00:00Z");
const NO_DATES = { scheduleDays: null, startDate: START };

const item = (topic: string, angle = "an angle", pillar = "Moral Fable") => ({
  topic,
  angle,
  pillar,
});

// ------------------------------------------------------------------ prompt

test("the prompt carries the workspace's own niche, keywords and competitors", () => {
  const prompt = buildPlanPrompt(
    {
      tenantId: "t1",
      tenantSettings: {
        industry: "Panchatantra fables",
        keywords: ["honesty", "greed"],
        competitors: ["ChannelA"],
        language: "hi",
      } as never,
    },
    30
  );

  assert.match(prompt, /Panchatantra fables/);
  assert.match(prompt, /honesty, greed/);
  assert.match(prompt, /ChannelA/);
  assert.match(prompt, /hi/);
});

test("already-planned topics are sent so the model cannot repeat them", () => {
  const prompt = buildPlanPrompt(
    {
      tenantId: "t1",
      tenantSettings: null,
      avoidTopics: ["The greedy merchant", "The honest woodcutter"],
    },
    1
  );

  assert.match(prompt, /Do not repeat/i);
  assert.match(prompt, /The honest woodcutter/);
});

test("the prompt names only the pillars the product understands", () => {
  const prompt = buildPlanPrompt({ tenantId: "t1", tenantSettings: null }, 30);
  for (const pillar of CONTENT_PILLARS) assert.ok(prompt.includes(pillar));
});

// ------------------------------------------------------- mapping the reply

test("a well-formed reply becomes one dated item per topic", () => {
  const items = toPlanItems(
    { items: [item("A"), item("B"), item("C")] },
    NO_DATES,
    30
  );

  assert.equal(items.length, 3);
  assert.deepEqual(items.map((i) => i.topic), ["A", "B", "C"]);
  assert.deepEqual(items.map((i) => i.position), [0, 1, 2]);
  // Dates are distinct, ascending, and start after today.
  assert.equal(new Set(items.map((i) => i.scheduled_date)).size, 3);
});

test("a repeated topic is dropped rather than becoming a duplicate video", () => {
  const items = toPlanItems(
    { items: [item("Same"), item("SAME"), item("Different")] },
    NO_DATES,
    30
  );

  assert.deepEqual(items.map((i) => i.topic), ["Same", "Different"]);
});

test("entries with no topic are dropped", () => {
  const items = toPlanItems(
    { items: [item(""), { angle: "orphan" }, item("Real")] as never },
    NO_DATES,
    30
  );

  assert.deepEqual(items.map((i) => i.topic), ["Real"]);
});

test("a short reply produces a short month, never padded back to placeholders", () => {
  const items = toPlanItems({ items: [item("Only one")] }, NO_DATES, 30);
  assert.equal(items.length, 1);
});

test("a reply with nothing usable throws so the caller can fall back", () => {
  assert.throws(() => toPlanItems({ items: [] }, NO_DATES, 30));
  assert.throws(() => toPlanItems({}, NO_DATES, 30));
  assert.throws(() => toPlanItems({ items: [item("")] }, NO_DATES, 30));
});

test("a free-typed pillar is coerced, and not all to the same one", () => {
  const items = toPlanItems(
    {
      items: [
        item("A", "x", "Motivational Banger"),
        item("B", "x", "Something Else"),
        item("C", "x", "Also Wrong"),
      ],
    },
    NO_DATES,
    30
  );

  for (const i of items) {
    assert.ok((CONTENT_PILLARS as readonly string[]).includes(i.pillar));
  }
  // A month labelled entirely "Moral Fable" is worse than approximate labels.
  assert.ok(new Set(items.map((i) => i.pillar)).size > 1);
});

test("a valid pillar is kept exactly as the model chose it", () => {
  const [only] = toPlanItems(
    { items: [item("A", "x", "Cultural Tale")] },
    NO_DATES,
    30
  );
  assert.equal(only.pillar, "Cultural Tale");
});

test("a missing angle gets a usable fallback instead of an empty cell", () => {
  const [only] = toPlanItems({ items: [{ topic: "A" }] }, NO_DATES, 30);
  assert.ok(only.angle.length > 0);
});

test("items land only on the days the schedule allows", () => {
  // Mondays (1) and Thursdays (4) only.
  const items = toPlanItems(
    { items: [item("A"), item("B"), item("C"), item("D")] },
    { scheduleDays: [1, 4], startDate: START },
    30
  );

  for (const i of items) {
    const day = new Date(`${i.scheduled_date}T00:00:00Z`).getUTCDay();
    assert.ok(day === 1 || day === 4, `${i.scheduled_date} is day ${day}`);
  }
});

test("every item starts life planned and unlocked", () => {
  const items = toPlanItems({ items: [item("A"), item("B")] }, NO_DATES, 30);
  for (const i of items) {
    assert.equal(i.status, "planned");
    assert.equal(i.locked, false);
  }
});

test("more topics than the requested count are truncated, not overflowed", () => {
  const many = Array.from({ length: 40 }, (_, i) => item(`Topic ${i}`));
  const items = toPlanItems({ items: many }, NO_DATES, 30);
  assert.equal(items.length, 30);
});
