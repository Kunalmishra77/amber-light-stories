import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * Resolves a stored `assets.storage_path` value to a browser-loadable URL.
 *
 * Uploads written by this app store the already-resolved public URL in
 * `storage_path` (see characters/actions.ts), but rows seeded elsewhere may
 * store a bare bucket-relative path instead — so this treats anything that
 * isn't already an absolute URL as a path in the public `assets` bucket.
 */
export function resolveAssetUrl(
  admin: ReturnType<typeof createAdminClient>,
  storagePath: string | null | undefined
): string | null {
  if (!storagePath) return null;
  if (/^https?:\/\//i.test(storagePath)) return storagePath;
  const { data } = admin.storage.from("assets").getPublicUrl(storagePath);
  return data.publicUrl ?? null;
}
