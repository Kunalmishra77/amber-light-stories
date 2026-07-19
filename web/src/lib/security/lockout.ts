import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

/**
 * Resolves an auth.users id from an email address. `profiles` has no email
 * column (email lives in auth.users, which PostgREST doesn't expose), and
 * the admin API has no server-side email filter, so this paginates
 * `listUsers` and matches case-insensitively. Fine at this SaaS's scale
 * (tens–hundreds of users); revisit if the user base grows large.
 */
export async function findUserIdByEmail(
  admin: SupabaseClient,
  email: string
): Promise<string | null> {
  const target = email.trim().toLowerCase();
  if (!target) return null;

  const perPage = 1000;
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error || !data?.users) break;

    const match = data.users.find((u) => u.email?.toLowerCase() === target);
    if (match) return match.id;

    if (data.users.length < perPage) break; // last page
  }
  return null;
}

export interface LockStatus {
  locked: boolean;
  message?: string;
  failedAttempts: number;
}

interface ProfileLockRow {
  locked_until: string | null;
  failed_login_attempts: number | null;
}

/** Reads current lock state for a user via the service-role client (no
 * session exists yet at this point in the login flow, so RLS would block
 * an authed-client read). */
export async function getLockStatus(admin: SupabaseClient, userId: string): Promise<LockStatus> {
  const { data } = await admin
    .from("profiles")
    .select("locked_until, failed_login_attempts")
    .eq("user_id", userId)
    .maybeSingle<ProfileLockRow>();

  const lockedUntil = data?.locked_until ? new Date(data.locked_until) : null;
  if (lockedUntil && lockedUntil.getTime() > Date.now()) {
    const minutes = Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 60_000));
    return {
      locked: true,
      message: `Account locked. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      failedAttempts: data?.failed_login_attempts ?? 0,
    };
  }

  return { locked: false, failedAttempts: data?.failed_login_attempts ?? 0 };
}

/** Increments failed_login_attempts and locks the account for
 * LOCK_MINUTES once MAX_ATTEMPTS is reached. */
export async function recordFailedLogin(
  admin: SupabaseClient,
  userId: string
): Promise<{ attempts: number; locked: boolean }> {
  const { data } = await admin
    .from("profiles")
    .select("failed_login_attempts")
    .eq("user_id", userId)
    .maybeSingle<{ failed_login_attempts: number | null }>();

  const attempts = (data?.failed_login_attempts ?? 0) + 1;
  const locked = attempts >= MAX_ATTEMPTS;

  const patch: Record<string, unknown> = { failed_login_attempts: attempts };
  if (locked) {
    patch.locked_until = new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString();
  }

  await admin.from("profiles").update(patch).eq("user_id", userId);
  return { attempts, locked };
}

/** Clears failed attempts + lock — called on successful login, and reused
 * by the super-admin "unlock" action. */
export async function resetLoginAttempts(admin: SupabaseClient, userId: string): Promise<void> {
  await admin
    .from("profiles")
    .update({ failed_login_attempts: 0, locked_until: null })
    .eq("user_id", userId);
}
