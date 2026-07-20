import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Resolves auth.users emails for a set of user ids. `profiles` doesn't store
 * email, and auth.users isn't exposed via PostgREST/RLS, so this is the one
 * place the service-role client is used for a *read* rather than a write —
 * only ever call this from within the super-admin-guarded /admin tree (the
 * (platform)/admin/layout.tsx guard covers every page under it).
 */
export async function getUserEmails(userIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (userIds.length === 0) return map;

  const admin = createAdminClient();
  const results = await Promise.all(
    userIds.map(async (id) => {
      try {
        const { data } = await admin.auth.admin.getUserById(id);
        return { id, email: data.user?.email ?? null };
      } catch {
        return { id, email: null };
      }
    })
  );

  for (const { id, email } of results) {
    if (email) map.set(id, email);
  }
  return map;
}
