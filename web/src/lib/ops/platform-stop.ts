import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Platform-wide stop (M15 O4).
 *
 * Stored as a M14 Global Config entry rather than a new table or flag: the
 * config service already gives it versioning, immutability and an audit trail,
 * and there is exactly one place to look for "is anything globally halted".
 *
 * Read on the hot path by the approval layer, so it is deliberately one cheap
 * indexed lookup with a fail-OPEN read (a config outage must not freeze every
 * workspace) and a fail-CLOSED write path (the setter verifies before returning).
 */
const NAMESPACE = "ops";
const KEY = "platform_stop";

export async function isPlatformStopped(db: SupabaseClient): Promise<boolean> {
  try {
    const { data } = await db
      .from("config_entries")
      .select("id, config_versions!config_entries_active_fk(value)")
      .eq("scope_type", "platform")
      .eq("namespace", NAMESPACE)
      .eq("key", KEY)
      .maybeSingle<{
        id: string;
        config_versions: { value: { stopped?: boolean } } | { value: { stopped?: boolean } }[] | null;
      }>();
    if (!data) return false;
    const v = Array.isArray(data.config_versions) ? data.config_versions[0] : data.config_versions;
    return Boolean(v?.value?.stopped);
  } catch {
    // Fail OPEN: an unreadable config must not halt every tenant on the platform.
    return false;
  }
}

/** Sets the platform stop by publishing a new immutable config version. */
export async function setPlatformStop(
  db: SupabaseClient,
  stopped: boolean,
  actorId: string | null,
  reason: string
): Promise<{ ok: boolean; error?: string }> {
  // The platform uniqueness rule is a PARTIAL index (scope_type = 'platform'),
  // which upsert's onConflict cannot target — so read, then create if missing.
  let entry = (
    await db
      .from("config_entries")
      .select("id")
      .eq("scope_type", "platform")
      .eq("namespace", NAMESPACE)
      .eq("key", KEY)
      .maybeSingle<{ id: string }>()
  ).data;

  if (!entry) {
    const { data, error } = await db
      .from("config_entries")
      .insert({ scope_type: "platform", scope_id: null, namespace: NAMESPACE, key: KEY })
      .select("id")
      .maybeSingle<{ id: string }>();
    if (error || !data) return { ok: false, error: error?.message ?? "Couldn't reach the config service." };
    entry = data;
  }

  const { data: last } = await db
    .from("config_versions")
    .select("version")
    .eq("entry_id", entry.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle<{ version: number }>();

  const { data: version, error: versionError } = await db
    .from("config_versions")
    .insert({
      entry_id: entry.id,
      version: (last?.version ?? 0) + 1,
      value: { stopped, reason, at: new Date().toISOString() },
      state: "active",
      immutable: true,
      created_by: actorId,
    })
    .select("id")
    .maybeSingle<{ id: string }>();
  if (versionError || !version) return { ok: false, error: versionError?.message ?? "Couldn't record the change." };

  const { error: pointerError } = await db
    .from("config_entries")
    .update({ active_version_id: version.id, updated_at: new Date().toISOString() })
    .eq("id", entry.id);
  if (pointerError) return { ok: false, error: pointerError.message };

  return { ok: true };
}
