import "server-only";
import { Readable } from "node:stream";
import { google } from "googleapis";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthorizedClient } from "@/lib/providers/youtube-oauth";
import { RenderedVideoMissingError, YouTubeAuthError, YouTubeUploadError } from "@/lib/publishing/errors";

export { RenderedVideoMissingError, YouTubeUploadError };

/**
 * Real YouTube upload (Priority 1).
 *
 * Deliberately refuses rather than inventing anything: with no rendered video
 * for the run there is nothing to upload, and a "successful" publish with no
 * media would be a lie recorded in the customer's publication history.
 */
const BUCKET = "assets";

/**
 * A per-run marker embedded in the video description.
 *
 * YouTube's API has no idempotency key, so a crash between "upload succeeded"
 * and "publication recorded" would otherwise cause a retry to upload the video
 * a second time. The marker lets a retry find the video it already created and
 * adopt it instead of duplicating it.
 */
export function runMarker(runId: string): string {
  return `[amber-light:run:${runId}]`;
}

/**
 * Looks for a video this run already uploaded to the connected channel.
 * Returns its id, or null if the run has not uploaded anything yet.
 *
 * Called only on a RETRY, so the extra quota cost is paid only when recovering.
 */
export async function findExistingUpload(input: {
  tenantId: string;
  runId: string;
}): Promise<string | null> {
  try {
    const auth = await getAuthorizedClient(input.tenantId);
    const youtube = google.youtube({ version: "v3", auth });

    // The channel's own uploads playlist is authoritative and cheap; search
    // indexing lags by minutes and would miss a video uploaded seconds ago.
    const { data: channels } = await youtube.channels.list({
      part: ["contentDetails"],
      mine: true,
    });
    const uploads = channels.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploads) return null;

    const { data: items } = await youtube.playlistItems.list({
      part: ["snippet", "contentDetails"],
      playlistId: uploads,
      maxResults: 25,
    });

    const marker = runMarker(input.runId);
    for (const item of items.items ?? []) {
      if ((item.snippet?.description ?? "").includes(marker)) {
        return item.contentDetails?.videoId ?? null;
      }
    }
    return null;
  } catch {
    // Reconciliation is best-effort. If it fails we fall through to uploading,
    // which is the same risk profile as having no reconciliation at all.
    return null;
  }
}

/**
 * Locates the rendered media for a run in the private assets bucket.
 * Returns a bucket-relative path, or null when nothing renderable exists.
 */
export async function findRenderedAsset(
  db: SupabaseClient,
  input: { tenantId: string; runId: string; storyId: string | null }
): Promise<string | null> {
  // Prefer an asset explicitly bound to this run/story, newest first.
  let query = db
    .from("assets")
    .select("storage_path, created_at, kind, story_id")
    .eq("tenant_id", input.tenantId)
    .eq("kind", "render")
    .order("created_at", { ascending: false })
    .limit(5);
  if (input.storyId) query = query.eq("story_id", input.storyId);

  const { data } = await query;
  const rows = (data ?? []) as { storage_path: string | null }[];

  for (const row of rows) {
    const path = normalizeBucketPath(row.storage_path);
    if (path) return path;
  }
  return null;
}

/**
 * Collapses a stored reference to a bucket-relative path. Local dev artifacts
 * (Windows paths from the Python render pipeline) are NOT uploadable and return
 * null — they are not objects in the bucket.
 */
function normalizeBucketPath(stored: string | null): string | null {
  if (!stored) return null;
  if (stored.includes("\\")) return null;
  const marks = ["/object/public/assets/", "/object/sign/assets/"];
  for (const mark of marks) {
    const i = stored.indexOf(mark);
    if (i !== -1) return stored.slice(i + mark.length).split("?")[0];
  }
  if (/^https?:\/\//i.test(stored)) return null;
  return stored.replace(/^\/+/, "");
}

export interface UploadInput {
  tenantId: string;
  runId: string;
  storyId: string | null;
  title: string;
  description: string;
  tags?: string[];
  /** YouTube privacy status. Defaults to `private` — never publish publicly by surprise. */
  privacyStatus?: "private" | "unlisted" | "public";
  client?: SupabaseClient;
}

export interface UploadResult {
  externalVideoId: string;
  privacyStatus: string;
  uploadStatus: string | null;
}

/**
 * Uploads the run's rendered video to the tenant's connected channel.
 *
 * Idempotency is owned by the CALLER (`publishRun` holds one publication row
 * per run). This function performs no bookkeeping of its own, so it is safe to
 * retry only when the caller has confirmed no publication exists.
 */
export async function uploadToYouTube(input: UploadInput): Promise<UploadResult> {
  const db = input.client ?? createAdminClient();

  const path = await findRenderedAsset(db, {
    tenantId: input.tenantId,
    runId: input.runId,
    storyId: input.storyId,
  });
  if (!path) throw new RenderedVideoMissingError(input.runId);

  const { data: file, error: downloadError } = await db.storage.from(BUCKET).download(path);
  if (downloadError || !file) {
    throw new YouTubeUploadError(
      `Couldn't read the rendered video from storage: ${downloadError?.message ?? "not found"}`
    );
  }

  const auth = await getAuthorizedClient(input.tenantId);
  const youtube = google.youtube({ version: "v3", auth });

  const body = Readable.fromWeb(file.stream() as unknown as Parameters<typeof Readable.fromWeb>[0]);

  try {
    const { data } = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title: input.title.slice(0, 100), // YouTube's hard limit
          // The marker is what makes a retry able to recognise its own upload.
          description: `${input.description.slice(0, 4800)}\n\n${runMarker(input.runId)}`,
          tags: input.tags?.slice(0, 30),
        },
        status: {
          privacyStatus: input.privacyStatus ?? "private",
          selfDeclaredMadeForKids: false,
        },
      },
      media: { body },
    });

    if (!data.id) {
      throw new YouTubeUploadError("YouTube accepted the upload but returned no video id.");
    }
    return {
      externalVideoId: data.id,
      privacyStatus: data.status?.privacyStatus ?? (input.privacyStatus ?? "private"),
      uploadStatus: data.status?.uploadStatus ?? null,
    };
  } catch (err) {
    if (err instanceof YouTubeAuthError || err instanceof YouTubeUploadError) throw err;

    const status = (err as { code?: number; status?: number })?.code ?? (err as { status?: number })?.status;
    const message = err instanceof Error ? err.message : "upload failed";

    // 401/403 = the grant is gone or lacks the upload scope: retrying cannot
    // fix it, the customer must reconnect.
    if (status === 401 || status === 403) {
      const { markCredentialRevoked } = await import("@/lib/providers/youtube-oauth");
      await markCredentialRevoked(input.tenantId);
      throw new YouTubeAuthError(`YouTube rejected the upload (${status}). Reconnect the channel.`);
    }
    // 400 = the request/media is wrong; retrying reproduces it exactly.
    if (status === 400) {
      throw new YouTubeUploadError(`YouTube rejected the video: ${message}`, false);
    }
    // Quota (403 is handled above as auth; 429/5xx are transient) → retryable.
    throw new YouTubeUploadError(message, true);
  }
}
