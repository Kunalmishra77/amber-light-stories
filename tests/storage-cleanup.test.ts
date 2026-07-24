/**
 * Storage orphan sweep — the only code in this product that deletes a client's
 * files. Every test here exists because the corresponding mistake would be
 * unrecoverable: there is no undo on a deleted render.
 *
 * Run: node --experimental-strip-types --import ./tests/security/loader.mjs \
 *        ./tests/storage-cleanup.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  sweepOrphanedStorage,
  type Entry,
  type StoragePort,
} from "@/lib/ops/storage-cleanup";

const NOW = Date.parse("2026-07-24T12:00:00Z");
const OLD = "2026-07-01T00:00:00Z"; // weeks past the age floor
const FRESH = "2026-07-24T11:00:00Z"; // an hour ago

const dir = (name: string): Entry => ({ name, id: null });
const file = (name: string, created_at: string | null = OLD): Entry => ({
  name,
  id: `obj-${name}`,
  created_at,
});

const TENANT = "11111111-2222-3333-4444-555555555555";

interface Fake {
  port: StoragePort;
  removed: string[];
  alerts: string[];
}

function fakeStorage(
  tree: Record<string, Entry[]>,
  referenced: Set<string> | null = new Set()
): Fake {
  const removed: string[] = [];
  const alerts: string[] = [];
  return {
    removed,
    alerts,
    port: {
      list: async (prefix) => tree[prefix] ?? [],
      referenced: async () => referenced,
      remove: async (paths) => {
        removed.push(...paths);
      },
      alert: async (subject) => {
        alerts.push(subject);
      },
    },
  };
}

test("deletes a render nothing points at any more", async () => {
  const f = fakeStorage({
    "": [dir(TENANT)],
    [`${TENANT}/renders`]: [dir("run-a")],
    [`${TENANT}/renders/run-a`]: [file("final.mp4")],
  });

  const sweep = await sweepOrphanedStorage(NOW, f.port);

  assert.equal(sweep.ok, true);
  assert.equal(sweep.removed, 1);
  assert.deepEqual(f.removed, [`${TENANT}/renders/run-a/final.mp4`]);
});

test("never deletes a render the database still points at", async () => {
  const live = `${TENANT}/renders/run-a/final.mp4`;
  const f = fakeStorage(
    {
      "": [dir(TENANT)],
      [`${TENANT}/renders`]: [dir("run-a")],
      [`${TENANT}/renders/run-a`]: [file("final.mp4"), file("thumb.png")],
    },
    new Set([live])
  );

  await sweepOrphanedStorage(NOW, f.port);

  assert.deepEqual(f.removed, [`${TENANT}/renders/run-a/thumb.png`]);
});

test("never deletes a render still inside the age floor", async () => {
  const f = fakeStorage({
    "": [dir(TENANT)],
    [`${TENANT}/renders`]: [dir("run-a")],
    [`${TENANT}/renders/run-a`]: [file("final.mp4", FRESH)],
  });

  const sweep = await sweepOrphanedStorage(NOW, f.port);

  assert.deepEqual(f.removed, []);
  assert.equal(sweep.keptRecent, 1);
});

test("keeps an object whose age cannot be established", async () => {
  const f = fakeStorage({
    "": [dir(TENANT)],
    [`${TENANT}/renders`]: [dir("run-a")],
    [`${TENANT}/renders/run-a`]: [file("final.mp4", null)],
  });

  await sweepOrphanedStorage(NOW, f.port);
  assert.deepEqual(f.removed, []);
});

test("never touches branding logos or user avatars", async () => {
  // These are LIVE files with no `assets` row — referenced only from
  // tenant_settings.brand / profiles.avatar. A whole-bucket sweep would treat
  // every one of them as an orphan.
  const f = fakeStorage({
    "": [dir("branding"), dir("avatars"), dir(TENANT)],
    "branding": [dir(TENANT)],
    [`branding/${TENANT}`]: [file("logo-1.png")],
    "avatars": [dir("user-1")],
    "avatars/user-1": [file("me.png")],
    [`${TENANT}/renders`]: [],
  });

  const sweep = await sweepOrphanedStorage(NOW, f.port);

  assert.deepEqual(f.removed, []);
  assert.equal(sweep.scanned, 0);
});

test("never touches music or character references", async () => {
  // Both live under the tenant folder but outside `renders/`, and both are
  // small — out of scope by design.
  const f = fakeStorage({
    "": [dir(TENANT)],
    [`${TENANT}`]: [dir("renders"), dir("music"), dir("characters")],
    [`${TENANT}/renders`]: [],
    [`${TENANT}/music`]: [file("bed.mp3")],
    [`${TENANT}/characters`]: [dir("c1")],
    [`${TENANT}/characters/c1`]: [file("ref.png")],
  });

  await sweepOrphanedStorage(NOW, f.port);
  assert.deepEqual(f.removed, []);
});

test("aborts without deleting when the reference set cannot be loaded", async () => {
  // A partial reference set makes live files look orphaned — the one failure
  // mode that must never end in a delete.
  const f = fakeStorage(
    {
      "": [dir(TENANT)],
      [`${TENANT}/renders`]: [dir("run-a")],
      [`${TENANT}/renders/run-a`]: [file("final.mp4")],
    },
    null
  );

  const sweep = await sweepOrphanedStorage(NOW, f.port);

  assert.equal(sweep.ok, false);
  assert.deepEqual(f.removed, []);
  assert.deepEqual(f.alerts, ["Storage sweep skipped"]);
});

test("caps how much a single run can delete", async () => {
  const many = Array.from({ length: 250 }, (_, i) => file(`clip-${i}.mp4`));
  const f = fakeStorage({
    "": [dir(TENANT)],
    [`${TENANT}/renders`]: [dir("run-a")],
    [`${TENANT}/renders/run-a`]: many,
  });

  const sweep = await sweepOrphanedStorage(NOW, f.port);

  assert.equal(sweep.removed, 200);
  assert.equal(f.removed.length, 200);
});

test("a listing failure reports instead of deleting a partial view", async () => {
  const f = fakeStorage({});
  f.port.list = async () => {
    throw new Error("storage unreachable");
  };

  const sweep = await sweepOrphanedStorage(NOW, f.port);

  assert.equal(sweep.ok, false);
  assert.match(sweep.reason ?? "", /unreachable/);
  assert.deepEqual(f.removed, []);
});
