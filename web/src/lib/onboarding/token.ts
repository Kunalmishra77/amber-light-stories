import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { OnboardingRecord } from "./types";

/**
 * Resolves an `onboarding` row by its public `link_token`. The public wizard
 * has no session (no auth), so RLS (which only grants access to
 * `authenticated`) can't apply — this always goes through the service-role
 * admin client. The token itself IS the credential here: every server action
 * under src/app/onboarding/[token] must re-derive the row from the token on
 * every call rather than trusting a client-supplied id, and must re-check
 * `status` before writing (never mutate an already-`approved` onboarding).
 */
export async function loadOnboardingByToken(token: string): Promise<OnboardingRecord | null> {
  if (!token) return null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("onboarding")
    .select(
      "id, tenant_id, status, business_info, api_status, link_token, owner_email, submitted_at, reviewed_by, reviewed_at, notes, created_at"
    )
    .eq("link_token", token)
    .maybeSingle();

  if (error || !data) return null;
  return data as OnboardingRecord;
}
