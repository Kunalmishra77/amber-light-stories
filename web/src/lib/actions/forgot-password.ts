"use server";

import { createClient } from "@/lib/supabase/server";
import { getAppOrigin } from "@/lib/site-url";

/**
 * Requests a Supabase password-reset email. Always resolves the same way
 * regardless of whether the email exists — the caller shows a generic "if
 * the account exists" message so this can never be used to enumerate
 * registered accounts.
 */
export async function requestPasswordResetAction(email: string): Promise<void> {
  const trimmed = email.trim();
  if (!trimmed) return;

  try {
    const origin = await getAppOrigin();
    const supabase = await createClient();
    await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo: `${origin}/reset-password`,
    });
  } catch {
    // Swallow — never leak whether the send succeeded or the email exists.
  }
}
