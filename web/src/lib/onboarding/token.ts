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
 *
 * Because the token IS the credential, it also EXPIRES (migration 042). The
 * window is only enforced while the onboarding is still editable: once the
 * client has submitted, the link must keep resolving so they can still see
 * their status on the waiting screen, and by then the write paths are already
 * closed by the status checks. An admin requesting changes re-opens the window.
 */
const EDITABLE_STATUSES = new Set(["created", "in_progress", "changes_requested"]);

function isExpired(record: OnboardingRecord): boolean {
  if (!EDITABLE_STATUSES.has(record.status)) return false;
  if (!record.link_expires_at) return false; // pre-migration rows stay usable
  const expiresAt = Date.parse(record.link_expires_at);
  return Number.isFinite(expiresAt) && expiresAt < Date.now();
}

export async function loadOnboardingByToken(token: string): Promise<OnboardingRecord | null> {
  if (!token) return null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("onboarding")
    .select(
      "id, tenant_id, status, business_info, api_status, link_token, link_expires_at, owner_email, submitted_at, reviewed_by, reviewed_at, notes, created_at"
    )
    .eq("link_token", token)
    .maybeSingle();

  if (error || !data) return null;

  const record = data as OnboardingRecord;
  // An expired link behaves exactly like an unknown one — the caller renders
  // "not found" and no detail about the workspace leaks.
  if (isExpired(record)) return null;
  return record;
}
