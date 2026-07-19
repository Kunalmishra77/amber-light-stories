"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findUserIdByEmail, getLockStatus, recordFailedLogin, resetLoginAttempts } from "@/lib/security/lockout";

/**
 * Signs the current user out and redirects to /login. Used as a form action
 * from the topbar's sign-out button — no client JS required.
 */
export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export interface SignInResult {
  ok: boolean;
  error?: string;
}

/**
 * Sign-in with account-lockout enforcement (P6.2). Looks up the account by
 * email via the service-role client BEFORE attempting sign-in so a locked
 * account is rejected without even trying the password; on failure it
 * increments `profiles.failed_login_attempts` and locks the account for 15
 * minutes once it reaches 5. Always returns a generic "Invalid email or
 * password" (with a remaining-attempts hint after 3) — never reveals
 * whether the email exists.
 */
export async function signInAction(formData: FormData): Promise<SignInResult> {
  const email = ((formData.get("email") as string | null) ?? "").trim();
  const password = (formData.get("password") as string | null) ?? "";

  if (!email || !password) {
    return { ok: false, error: "Email and password are required." };
  }

  const admin = createAdminClient();
  const userId = await findUserIdByEmail(admin, email);

  if (userId) {
    const lock = await getLockStatus(admin, userId);
    if (lock.locked) {
      return { ok: false, error: lock.message! };
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    if (userId) {
      const { attempts, locked } = await recordFailedLogin(admin, userId);
      if (locked) {
        return { ok: false, error: "Too many failed attempts. Account locked for 15 minutes." };
      }
      const remaining = Math.max(0, 5 - attempts);
      if (attempts >= 3 && remaining > 0) {
        return {
          ok: false,
          error: `Invalid email or password. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining before lockout.`,
        };
      }
    }
    return { ok: false, error: "Invalid email or password." };
  }

  await resetLoginAttempts(admin, data.user.id);
  return { ok: true };
}
