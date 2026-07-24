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
import { toBucketPath } from "@/lib/assets";

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

test("caps how much a single run can delete, and says so", async () => {
  const many = Array.from({ length: 250 }, (_, i) => file(`clip-${i}.mp4`));
  const f = fakeStorage({
    "": [dir(TENANT)],
    [`${TENANT}/renders`]: [dir("run-a")],
    [`${TENANT}/renders/run-a`]: many,
  });

  const sweep = await sweepOrphanedStorage(NOW, f.port);

  assert.equal(sweep.removed, 200);
  assert.equal(f.removed.length, 200);
  // The other 50 must survive to the next run, not be silently included.
  assert.equal(new Set(f.removed).size, 200);
  // Filling the cap is a symptom, not routine housekeeping.
  assert.deepEqual(f.alerts, ["Storage sweep hit its delete cap"]);
});

test("keeps an object recorded while the scan was running", async () => {
  // A render uploads BEFORE it writes its row, so an object can be
  // unreferenced when listed and live by the time the delete goes out.
  const path = `${TENANT}/renders/run-a/final.mp4`;
  const f = fakeStorage({
    "": [dir(TENANT)],
    [`${TENANT}/renders`]: [dir("run-a")],
    [`${TENANT}/renders/run-a`]: [file("final.mp4")],
  });
  let call = 0;
  f.port.referenced = async () => (++call === 1 ? new Set() : new Set([path]));

  const sweep = await sweepOrphanedStorage(NOW, f.port);

  assert.equal(sweep.removed, 0);
  assert.deepEqual(f.removed, []);
});

test("deletes nothing if the reference set goes unreadable before the delete", async () => {
  const f = fakeStorage({
    "": [dir(TENANT)],
    [`${TENANT}/renders`]: [dir("run-a")],
    [`${TENANT}/renders/run-a`]: [file("final.mp4")],
  });
  let call = 0;
  f.port.referenced = async () => (++call === 1 ? new Set() : null);

  const sweep = await sweepOrphanedStorage(NOW, f.port);

  assert.equal(sweep.ok, false);
  assert.deepEqual(f.removed, []);
});

test("an object exactly at the cutoff is kept, not deleted", async () => {
  const cutoff = new Date(NOW - 24 * 3600_000).toISOString();
  const f = fakeStorage({
    "": [dir(TENANT)],
    [`${TENANT}/renders`]: [dir("run-a")],
    [`${TENANT}/renders/run-a`]: [file("final.mp4", cutoff)],
  });

  await sweepOrphanedStorage(NOW, f.port);
  assert.deepEqual(f.removed, []);
});

test("a second sweep straight after the first deletes nothing new", async () => {
  const tree: Record<string, Entry[]> = {
    "": [dir(TENANT)],
    [`${TENANT}/renders`]: [dir("run-a")],
    [`${TENANT}/renders/run-a`]: [file("final.mp4")],
  };
  const f = fakeStorage(tree);
  f.port.remove = async (paths) => {
    f.removed.push(...paths);
    tree[`${TENANT}/renders/run-a`] = []; // the objects are gone now
  };

  await sweepOrphanedStorage(NOW, f.port);
  const before = f.removed.length;
  const second = await sweepOrphanedStorage(NOW, f.port);

  assert.equal(second.removed, 0);
  assert.equal(f.removed.length, before);
});

test("skips a stray file directly under renders/ and a folder inside a run", async () => {
  const f = fakeStorage({
    "": [dir(TENANT)],
    // `stray.mp4` is a file where run folders live; `nested` is a folder
    // where files live. Neither is a render output path.
    [`${TENANT}/renders`]: [file("stray.mp4"), dir("run-a")],
    [`${TENANT}/renders/run-a`]: [dir("nested")],
  });

  const sweep = await sweepOrphanedStorage(NOW, f.port);

  assert.equal(sweep.scanned, 0);
  assert.deepEqual(f.removed, []);
});

test("a tenant-shaped folder is matched case-insensitively, anything else is skipped", async () => {
  const upper = TENANT.toUpperCase();
  const f = fakeStorage({
    "": [dir(upper), dir("exports")],
    [`${upper}/renders`]: [dir("run-a")],
    [`${upper}/renders/run-a`]: [file("final.mp4")],
    "exports/renders": [dir("run-b")],
    "exports/renders/run-b": [file("bundle.zip")],
  });

  await sweepOrphanedStorage(NOW, f.port);

  // The uuid folder is swept; a future top-level folder is not.
  assert.deepEqual(f.removed, [`${upper}/renders/run-a/final.mp4`]);
});

test("the path the sweep builds is exactly what the render worker records", async () => {
  // pipeline/render_worker._upload_asset writes
  // f"{tenant_id}/renders/{run_id}/{filename}" and _record_asset stores it
  // verbatim. If either side's shape drifts, the sweep either stops finding
  // orphans or starts deleting live renders — and nothing else would notice.
  const run = "99999999-8888-7777-6666-555555555555";
  const recorded = `${TENANT}/renders/${run}/final.mp4`;
  const f = fakeStorage(
    {
      "": [dir(TENANT)],
      [`${TENANT}/renders`]: [dir(run)],
      [`${TENANT}/renders/${run}`]: [file("final.mp4")],
    },
    new Set([toBucketPath(recorded)!])
  );

  await sweepOrphanedStorage(NOW, f.port);
  assert.deepEqual(f.removed, []);
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
