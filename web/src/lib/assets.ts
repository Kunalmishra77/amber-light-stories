/**
 * Minimal shape this function needs — satisfied by both the authed
 * (server.ts / client.ts) and service-role (admin.ts) Supabase clients.
 * Building a public URL is a pure client-side string operation (no network
 * call, no RLS involved), so either client works.
 */
interface StorageCapableClient {
  storage: {
    from(bucket: string): {
      getPublicUrl(path: string): { data: { publicUrl: string } };
    };
  };
}

/**
 * Resolves a stored `assets.storage_path` value to a browser-loadable URL.
 *
 * Uploads written by this app store the already-resolved public URL in
 * `storage_path` (see characters/actions.ts), but rows seeded elsewhere may
 * store a bare bucket-relative path instead — so this treats anything that
 * isn't already an absolute URL as a path in the public `assets` bucket.
 */
export function resolveAssetUrl(
  client: StorageCapableClient,
  storagePath: string | null | undefined
): string | null {
  if (!storagePath) return null;
  if (/^https?:\/\//i.test(storagePath)) return storagePath;
  const { data } = client.storage.from("assets").getPublicUrl(storagePath);
  return data.publicUrl ?? null;
}
