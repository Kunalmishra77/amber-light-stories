import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { toBucketPath } from "@/lib/assets";
import { alertOperator } from "@/lib/ops/alert-operator";

const BUCKET = "assets";

/**
 * Only render output is swept. Every other prefix in the bucket is either tiny
 * or NOT tracked by the `assets` table at all — `branding/<tenant>/logo-*` and
 * `avatars/<user>/*` are live files whose only reference lives in
 * `tenant_settings.brand` / `profiles.avatar`. Treating "no `assets` row" as
 * "orphan" across the whole bucket would delete clients' logos. Renders are
 * also where the bytes actually are: one MP4 dwarfs every logo combined.
 */
const SWEPT_SUBFOLDER = "renders";

/** A run's output is never orphaned until well past any retry window. */
const MIN_AGE_HOURS = 24;

/** Blast-radius cap: a bug can cost at most this many objects per run. */
const MAX_DELETES_PER_RUN = 200;

/**
 * If the bucket ever grows past this, the reference set can no longer be
 * loaded in one pass — and a PARTIAL reference set makes live files look
 * orphaned. The sweep aborts instead of guessing.
 */
export const MAX_REFERENCED_ROWS = 50_000;

const PAGE = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface StorageSweep {
  ok: boolean;
  scanned: number;
  removed: number;
  keptRecent: number;
  reason?: string;
}

/** A storage listing entry. Folders are distinguished by a null `id`. */
export interface Entry {
  name: string;
  id: string | null;
  created_at?: string | null;
}

/**
 * The sweep's whole contact surface with the outside world, so the deletion
 * RULES can be tested without a live bucket — the rules are the part that,
 * wrong, destroys a client's videos.
 */
export interface StoragePort {
  list(prefix: string): Promise<Entry[]>;
  /** Every bucket path still referenced, or null if there are too many to load. */
  referenced(): Promise<Set<string> | null>;
  remove(paths: string[]): Promise<void>;
  alert(subject: string, html: string): Promise<void>;
}

export function supabasePort(): StoragePort {
  const admin = createAdminClient();

  return {
    async list(prefix) {
      const out: Entry[] = [];
      for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await admin.storage
          .from(BUCKET)
          .list(prefix, { limit: PAGE, offset });
        if (error) throw new Error(`list ${prefix}: ${error.message}`);
        const page = (data ?? []) as Entry[];
        out.push(...page);
        if (page.length < PAGE) return out;
      }
    },

    async referenced() {
      // How many rows there SHOULD be, read first. Paging until a short page
      // appears is not a termination condition here: PostgREST caps a
      // response at the project's `max-rows` setting, so a page can come back
      // short simply because an operator lowered that cap — and the sweep
      // would then treat a fraction of the table as the whole of it and
      // delete every live render it never saw.
      const { count, error: countError } = await admin
        .from("assets")
        .select("storage_path", { count: "exact", head: true });
      if (countError) throw new Error(`assets count: ${countError.message}`);
      if (count === null || count > MAX_REFERENCED_ROWS) return null;

      const paths = new Set<string>();
      let loaded = 0;
      while (loaded < count) {
        const { data, error } = await admin
          .from("assets")
          .select("storage_path")
          // Without an explicit order, Postgres may return rows in any order
          // between pages — and the render worker DELETEs and INSERTs into
          // this table on every render, so rows genuinely shift. An unordered
          // paginated read silently SKIPS rows, and a skipped row is a live
          // file that looks orphaned.
          .order("id", { ascending: true })
          .range(loaded, loaded + 999);
        if (error) throw new Error(`assets: ${error.message}`);

        const rows = data ?? [];
        if (rows.length === 0) break; // rows deleted underneath us
        for (const row of rows) {
          const path = toBucketPath(row.storage_path as string | null);
          if (path) paths.add(path);
        }
        loaded += rows.length;
      }

      // Rows can legitimately disappear mid-read (the worker replaces assets),
      // so short is tolerable; anything more is a paging failure, not churn.
      if (loaded < count * 0.99) return null;
      return paths;
    },

    async remove(paths) {
      const { error } = await admin.storage.from(BUCKET).remove(paths);
      if (error) throw new Error(`remove: ${error.message}`);
    },

    alert: async (subject, html) => {
      await alertOperator(subject, html);
    },
  };
}

/**
 * Deletes render objects in the `assets` bucket that no `assets` row points at
 * and that are older than MIN_AGE_HOURS.
 *
 * These accumulate for real reasons, not hypothetical ones: the render worker
 * replaces an asset ROW for a re-rendered story without removing the object it
 * used to point at, and a job that dies after uploading but before recording
 * leaves its upload behind. Nothing else in the product ever deletes a storage
 * object, so without this the bucket only grows.
 *
 * Best-effort and non-throwing — it runs at the tail of the job-drain cron and
 * must never fail a drain that already succeeded.
 */
export async function sweepOrphanedStorage(
  now: number = Date.now(),
  port?: StoragePort
): Promise<StorageSweep> {
  const sweep: StorageSweep = { ok: true, scanned: 0, removed: 0, keptRecent: 0 };
  try {
    const io = port ?? supabasePort();

    const referenced = await io.referenced();
    if (!referenced) {
      sweep.ok = false;
      sweep.reason = "reference set too large to load — sweep skipped";
      await io.alert(
        "Storage sweep skipped",
        `<p>The <code>assets</code> table now exceeds ${MAX_REFERENCED_ROWS} rows, so the ` +
          `orphan sweep can no longer load every referenced path in one pass. It refused to ` +
          `delete anything rather than risk removing live files. Raise the limit or move the ` +
          `check into SQL.</p>`
      );
      return sweep;
    }

    const cutoff = now - MIN_AGE_HOURS * 3600_000;
    const doomed: string[] = [];

    // Root entries are tenant folders, plus `branding` and `avatars`, which are
    // deliberately never swept. Requiring a UUID keeps any future top-level
    // folder out of the sweep by default.
    outer: for (const tenant of await io.list("")) {
      if (!UUID.test(tenant.name)) continue;

      const base = `${tenant.name}/${SWEPT_SUBFOLDER}`;
      for (const run of await io.list(base)) {
        if (run.id !== null) continue; // a file directly under renders/, not a run folder

        for (const file of await io.list(`${base}/${run.name}`)) {
          if (file.id === null) continue; // nested folder — out of scope
          sweep.scanned += 1;

          const path = `${base}/${run.name}/${file.name}`;
          if (referenced.has(path)) continue;

          // No timestamp means we cannot prove it is old. Keep it.
          const created = file.created_at ? Date.parse(file.created_at) : NaN;
          // `>=` keeps an object sitting exactly on the cutoff, matching the
          // worker's local sweep — on a boundary, keeping is the recoverable
          // choice.
          if (!Number.isFinite(created) || created >= cutoff) {
            sweep.keptRecent += 1;
            continue;
          }

          doomed.push(path);
          if (doomed.length >= MAX_DELETES_PER_RUN) break outer;
        }
      }
    }

    if (doomed.length) {
      // Listing the bucket takes time, and a render that finished during it
      // uploads BEFORE it records the row — so an object can be unreferenced
      // when seen and live by now. Re-checking here shrinks that window from
      // the length of the whole scan to the length of one query.
      const stillReferenced = await io.referenced();
      if (!stillReferenced) {
        sweep.ok = false;
        sweep.reason = "reference set unavailable on re-check — deleted nothing";
        return sweep;
      }
      const confirmed = doomed.filter((p) => !stillReferenced.has(p));
      if (confirmed.length) {
        await io.remove(confirmed);
        sweep.removed = confirmed.length;
      }
    }

    // Steady state here is roughly zero: both objects under `renders/` are
    // recorded as they are uploaded. A run that fills the cap is not
    // housekeeping, it is a symptom — say so rather than quietly repeating it
    // every night.
    if (sweep.removed >= MAX_DELETES_PER_RUN) {
      await io.alert(
        "Storage sweep hit its delete cap",
        `<p>The orphan sweep removed its per-run maximum of ${MAX_DELETES_PER_RUN} objects ` +
          `from <code>renders/</code>. That is far above the handful expected, so check what ` +
          `is orphaning renders before the next run removes another ${MAX_DELETES_PER_RUN}.</p>`
      );
    }
    return sweep;
  } catch (err) {
    sweep.ok = false;
    sweep.reason = err instanceof Error ? err.message : String(err);
    return sweep;
  }
}
