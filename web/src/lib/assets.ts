import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "assets";
const PUBLIC_MARK = "/object/public/assets/";
const SIGN_MARK = "/object/sign/assets/";

/**
 * Normalize any stored asset reference to a bucket-relative path.
 *
 * The `assets` bucket is PRIVATE (ISS-C2 / ADR-073): objects are served only
 * via short-lived signed URLs, never public URLs. Historically `storage_path`
 * / `logo_url` may hold a full public URL, a signed URL, a bare path, or an
 * external (non-Supabase) URL — this collapses all of those to a bucket path,
 * or signals a pass-through for genuinely external images.
 */
function classify(stored: string): { path?: string; passthrough?: string } {
  const pub = stored.indexOf(PUBLIC_MARK);
  if (pub !== -1) return { path: stripQuery(stored.slice(pub + PUBLIC_MARK.length)) };
  const sig = stored.indexOf(SIGN_MARK);
  if (sig !== -1) return { path: stripQuery(stored.slice(sig + SIGN_MARK.length)) };
  // External (non-Supabase) absolute URL → show as-is.
  if (/^https?:\/\//i.test(stored)) return { passthrough: stored };
  // Any other scheme is not a bucket key either — `mock://…` placeholders are
  // written by the pipeline's dry-run adapters.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(stored)) return {};
  // Windows/local render artifacts (e.g. "storage\_render_test\x.mp4") aren't
  // objects in the bucket.
  if (stored.includes("\\")) return {};
  // Already a bare bucket-relative path.
  return { path: stored.replace(/^\/+/, "") };
}

function stripQuery(s: string): string {
  const q = s.indexOf("?");
  return q === -1 ? s : s.slice(0, q);
}

/**
 * The bucket-relative path a stored reference points at, or null when it isn't
 * an object in this bucket at all (an external URL, or a local render
 * artifact). Exposed so the storage sweep decides what "referenced" means with
 * the SAME rules that decide what is displayable — a sweep that disagreed with
 * `resolveAssetUrl` about which paths are real would delete live files.
 */
export function toBucketPath(stored: string | null | undefined): string | null {
  if (!stored) return null;
  return classify(stored).path ?? null;
}

/**
 * Sign a known bucket path → a time-boxed URL (used right after upload for
 * immediate display). Returns null if signing fails. Server-only.
 */
export async function signAssetPath(
  path: string,
  expiresIn = 3600
): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin.storage.from(BUCKET).createSignedUrl(path, expiresIn);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve a stored asset reference to a browser-loadable, short-lived signed
 * URL from the PRIVATE `assets` bucket. External URLs pass through untouched;
 * local/dev artifacts resolve to null. Server-only (signs with the service
 * role; the caller must already have gated the request to the owning tenant).
 */
export async function resolveAssetUrl(
  storagePath: string | null | undefined,
  expiresIn = 3600
): Promise<string | null> {
  if (!storagePath) return null;
  const { path, passthrough } = classify(storagePath);
  if (passthrough) return passthrough;
  if (!path) return null;
  return signAssetPath(path, expiresIn);
}
