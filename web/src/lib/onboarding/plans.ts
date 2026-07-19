import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PlanRow } from "./types";

/**
 * Reads the active plan catalog for the Subscription step of the public
 * onboarding wizard. The wizard has no session (no auth), so RLS — which
 * only grants `plans_read` to `authenticated` — can't apply, same reasoning
 * as `loadOnboardingByToken`. This is a read-only, non-sensitive catalog
 * listing, so going through the service-role admin client is safe.
 */
export async function loadActivePlans(): Promise<PlanRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("plans")
    .select("id, name, slug, price_month, limits, features")
    .eq("active", true)
    .order("sort", { ascending: true });

  if (error || !data) return [];
  return data as PlanRow[];
}
