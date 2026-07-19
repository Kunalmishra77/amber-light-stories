"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";
import { logAudit } from "@/lib/ops/audit";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Signs the current user out of every session/device (Supabase's "global"
 * sign-out scope revokes all refresh tokens for the user, not just this
 * browser). The current request's own cookies are also cleared, so the
 * caller should redirect to /login immediately after.
 */
export async function signOutEverywhere(): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "You're not signed in." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "global" });
  if (error) return { ok: false, error: error.message };

  await logAudit({ action: "security.sign_out_everywhere", target: `user:${user.id}` });

  return { ok: true };
}
