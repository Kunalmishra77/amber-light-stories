import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Format Profiles (M12 G2 — ADR-040/045). Format is CONFIG consumed by the one
 * pipeline: aspect ratio, duration bounds, scene budget, pacing, caption/audio
 * profile, and the publishing destination. A new platform is a profile + an
 * existing publishing adapter — never a new pipeline.
 *
 * Resolution order: tenant profile for the key -> tenant default -> platform
 * profile for the key -> platform default.
 */
export interface FormatProfile {
  id: string;
  tenant_id: string | null;
  key: string;
  name: string;
  aspect_ratio: string;
  target_seconds: number | null;
  min_seconds: number | null;
  max_seconds: number | null;
  scene_budget: number | null;
  pacing: string | null;
  caption_style: Record<string, unknown>;
  audio_profile: Record<string, unknown>;
  publishing_provider: string | null;
  is_default: boolean;
  enabled: boolean;
}

const COLS =
  "id, tenant_id, key, name, aspect_ratio, target_seconds, min_seconds, max_seconds, scene_budget, pacing, caption_style, audio_profile, publishing_provider, is_default, enabled";

export async function resolveFormatProfile(
  tenantId: string,
  key?: string | null,
  client?: SupabaseClient
): Promise<FormatProfile | null> {
  const sb = client ?? (await createClient());

  // 1) tenant profile for the requested key
  if (key) {
    const { data } = await sb
      .from("format_profiles")
      .select(COLS)
      .eq("tenant_id", tenantId)
      .eq("key", key)
      .eq("enabled", true)
      .maybeSingle();
    if (data) return data as FormatProfile;
  }

  // 2) the tenant's own default
  {
    const { data } = await sb
      .from("format_profiles")
      .select(COLS)
      .eq("tenant_id", tenantId)
      .eq("is_default", true)
      .eq("enabled", true)
      .limit(1);
    const row = ((data ?? []) as FormatProfile[])[0];
    if (row) return row;
  }

  // 3) platform profile for the requested key
  if (key) {
    const { data } = await sb
      .from("format_profiles")
      .select(COLS)
      .is("tenant_id", null)
      .eq("key", key)
      .eq("enabled", true)
      .maybeSingle();
    if (data) return data as FormatProfile;
  }

  // 4) platform default
  const { data } = await sb
    .from("format_profiles")
    .select(COLS)
    .is("tenant_id", null)
    .eq("is_default", true)
    .eq("enabled", true)
    .limit(1);
  return ((data ?? []) as FormatProfile[])[0] ?? null;
}

/** Every profile visible to a tenant (its own + platform defaults). */
export async function listFormatProfiles(
  tenantId: string,
  client?: SupabaseClient
): Promise<FormatProfile[]> {
  const sb = client ?? (await createClient());
  const { data } = await sb
    .from("format_profiles")
    .select(COLS)
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
    .eq("enabled", true)
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });
  return (data ?? []) as FormatProfile[];
}
