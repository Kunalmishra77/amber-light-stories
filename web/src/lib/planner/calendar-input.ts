import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Calendar as a first-class GENERATION INPUT (M12 G2 — ADR-048). The existing
 * planner (`content_plans` / `plan_items`) already holds the workspace's
 * calendar; this reads the item planned for a date so Strategy/Topic generation
 * consumes it instead of inventing a topic. No new planning system.
 */
export interface PlannedItem {
  id: string;
  scheduled_date: string;
  topic: string | null;
  angle: string | null;
  pillar: string | null;
  campaign: string | null;
  theme: string | null;
  locale: string;
  format_profile_id: string | null;
  status: string | null;
}

const COLS =
  "id, scheduled_date, topic, angle, pillar, campaign, theme, locale, format_profile_id, status";

/** The item planned for `date` (UTC day) that is still actionable. */
export async function getPlannedItemForDate(
  tenantId: string,
  date: string,
  client?: SupabaseClient
): Promise<PlannedItem | null> {
  const sb = client ?? createAdminClient();
  const { data } = await sb
    .from("plan_items")
    .select(COLS)
    .eq("tenant_id", tenantId)
    .eq("scheduled_date", date)
    .in("status", ["planned", "approved"])
    .order("position", { ascending: true })
    .limit(1);
  return ((data ?? []) as PlannedItem[])[0] ?? null;
}

export async function getPlannedItemForToday(
  tenantId: string,
  client?: SupabaseClient
): Promise<PlannedItem | null> {
  return getPlannedItemForDate(tenantId, new Date().toISOString().slice(0, 10), client);
}
