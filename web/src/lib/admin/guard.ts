import "server-only";
import { getProfile } from "@/lib/auth";

/**
 * Re-verifies super-admin status server-side. Every /admin server action
 * MUST call this before touching data — never trust that the request came
 * from the guarded /admin route tree (server actions are directly callable).
 * Throws so the calling action can let it propagate as a rejected promise.
 */
export async function requireSuperAdmin() {
  const profile = await getProfile();
  if (!profile?.is_super_admin) {
    throw new Error("Forbidden: super admin access required.");
  }
  return profile;
}
