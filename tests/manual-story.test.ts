/**
 * Manual video: a client's own script becomes a real pipeline.
 *
 * Manual Content used to save a bare draft with no run, so the video never
 * reached the pipeline. It now builds the SAME draft shape the AI generator
 * does — these tests pin the part that matters: the client's exact words drive
 * the narration and captions, and the scenes are shaped so the render can run.
 *
 * Run: node --experimental-strip-types --import ./tests/security/loader.mjs \
 *        ./tests/manual-story.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { buildManualDraft } from "@/lib/generate/manual-story";

const SCRIPT = `पहली पंक्ति यहाँ है।

दूसरी पंक्ति यहाँ है।

तीसरी पंक्ति यहाँ है।`;

test("each paragraph the author wrote becomes its own scene", () => {
  const draft = buildManualDraft({ title: "Test", script: SCRIPT });
  assert.equal(draft.scenes.length, 3);
});

test("the narration and subtitles are the client's exact words", () => {
  const draft = buildManualDraft({ title: "Test", script: SCRIPT });
  assert.equal(draft.scenes[0].narration, "पहली पंक्ति यहाँ है।");
  assert.equal(draft.scenes[0].subtitle, draft.scenes[0].narration);
});

test("the whole script is preserved across the scenes, nothing dropped", () => {
  const draft = buildManualDraft({ title: "Test", script: SCRIPT });
  const joined = draft.scenes.map((s) => s.narration).join(" ");
  for (const line of ["पहली", "दूसरी", "तीसरी"]) assert.ok(joined.includes(line));
});

test("scene timings tile the target duration in order without gaps", () => {
  const draft = buildManualDraft({
    title: "Test",
    script: SCRIPT,
    settings: { targetSeconds: 45 },
  });
  assert.equal(draft.scenes[0].start_sec, 0);
  assert.equal(draft.duration_seconds, 45);
  // Contiguous: each scene starts where the previous ended.
  for (let i = 1; i < draft.scenes.length; i++) {
    assert.ok(Math.abs(draft.scenes[i].start_sec - draft.scenes[i - 1].end_sec) < 0.2);
  }
  // The last scene reaches the end.
  assert.ok(Math.abs(draft.scenes.at(-1)!.end_sec - 45) < 0.2);
});

test("the first and last scenes are HIGH importance (hook and payoff)", () => {
  const draft = buildManualDraft({ title: "Test", script: SCRIPT });
  assert.equal(draft.scenes[0].importance, "HIGH");
  assert.equal(draft.scenes.at(-1)!.importance, "HIGH");
});

test("every scene carries an image subject so the frame is on-topic", () => {
  const draft = buildManualDraft({ title: "Jantar Mantar", script: SCRIPT });
  for (const s of draft.scenes) {
    assert.ok(s.prompt.subject && s.prompt.subject.length > 0);
    // The video's title anchors every frame to the same subject.
    assert.ok(s.prompt.subject!.includes("Jantar Mantar"));
  }
});

test("a single unbroken paragraph is split into several scenes, not one", () => {
  const oneBlock =
    "पहला वाक्य। दूसरा वाक्य। तीसरा वाक्य। चौथा वाक्य। पाँचवाँ वाक्य। छठा वाक्य।";
  const draft = buildManualDraft({
    title: "Test",
    script: oneBlock,
    settings: { targetSeconds: 45 },
  });
  assert.ok(draft.scenes.length >= 3);
});

test("an English single block splits on sentence boundaries too", () => {
  const draft = buildManualDraft({
    title: "Test",
    script: "First sentence here. Second one here. Third one now. Fourth and last.",
    settings: { targetSeconds: 40 },
  });
  assert.ok(draft.scenes.length >= 2);
  assert.ok(draft.scenes.every((s) => s.narration.length > 0));
});

test("provenance is marked manual, not mock or AI", () => {
  const draft = buildManualDraft({ title: "Test", script: SCRIPT });
  assert.equal(draft.beat_sheet.source, "manual");
  assert.equal(draft.beat_sheet.mock, false);
});

test("the title becomes the topic and the SEO title", () => {
  const draft = buildManualDraft({ title: "My Video Title", script: SCRIPT });
  assert.equal(draft.topic, "My Video Title");
  assert.equal(draft.beat_sheet.seo.title, "My Video Title");
});
