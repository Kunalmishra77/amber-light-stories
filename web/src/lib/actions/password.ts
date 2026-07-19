"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";
import { validatePasswordStrength } from "@/lib/security/password-policy";

export interface PasswordActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Shared by both /change-password (forced first-login change) and
 * /reset-password (forgot-password recovery link) — both operate on an
 * already-authenticated session (a normal session for the former, a
 * Supabase recovery session for the latter) and both clear
 * `must_change_password` once a new password is set.
 */
async function applyNewPassword(newPassword: string): Promise<PasswordActionResult> {
  const user = await getSessionUser();
  if (!user) {
    return { ok: false, error: "Your session has expired. Please request a new link." };
  }

  const check = validatePasswordStrength(newPassword);
  if (!check.ok) return { ok: false, error: check.error };

  const supabase = await createClient();
  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
  if (updateError) return { ok: false, error: updateError.message };

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ must_change_password: false, password_changed_at: new Date().toISOString() })
    .eq("user_id", user.id);
  if (profileError) return { ok: false, error: profileError.message };

  return { ok: true };
}

/** Forced first-login change (/change-password). Keeps the session — the
 * user lands straight in the app afterwards. */
export async function changePasswordAction(newPassword: string): Promise<PasswordActionResult> {
  const result = await applyNewPassword(newPassword);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

/** Forgot-password recovery (/reset-password). Signs the recovery session
 * out afterwards so the user re-authenticates cleanly via /login. */
export async function resetPasswordAction(newPassword: string): Promise<PasswordActionResult> {
  const result = await applyNewPassword(newPassword);
  if (result.ok) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  return result;
}
