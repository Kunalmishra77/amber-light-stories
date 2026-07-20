"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/admin/guard";
import { writeAuditLog } from "@/lib/admin/audit";
import type { PlatformTheme } from "@/lib/branding";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const HEX_RE = /^#[0-9a-fA-F]{3,8}$/;
const VALID_FONTS = new Set(["Inter", "System", "Geist"]);
const VALID_MODES = new Set(["dark", "light"]);
const VALID_BUTTON_STYLES = new Set(["solid", "outline"]);

function readColor(formData: FormData, key: string): string | undefined {
  const raw = ((formData.get(key) as string | null) ?? "").trim();
  return raw || undefined;
}

/**
 * Persists platform_settings (id=1) — platform name, favicon emoji, loading
 * message, and the full theme token set. Super-admin only; the RLS
 * `admin_write` policy on platform_settings double-enforces this at the DB
 * layer too. Revalidates the root layout so every route (including /login,
 * which reads platform_settings pre-auth) picks up the new theme on next
 * load with no code change.
 */
export async function updatePlatformSettings(formData: FormData): Promise<ActionResult> {
  const profile = await requireSuperAdmin();

  const platformName = ((formData.get("platform_name") as string | null) ?? "").trim();
  if (!platformName) return { ok: false, error: "Platform name is required." };

  const faviconEmoji = ((formData.get("favicon_emoji") as string | null) ?? "").trim();
  if (!faviconEmoji) return { ok: false, error: "Favicon emoji is required." };

  const loadingMessage =
    ((formData.get("loading_message") as string | null) ?? "").trim() || "Loading...";

  const colorFields = [
    "primary",
    "primary_hover",
    "accent",
    "sidebar",
    "background",
    "surface",
    "foreground",
  ] as const;

  const theme: PlatformTheme = {};
  for (const field of colorFields) {
    const value = readColor(formData, field);
    if (value) {
      if (!HEX_RE.test(value)) {
        return { ok: false, error: `"${field}" must be a hex color like #F59E0B.` };
      }
      theme[field] = value;
    }
  }

  const radius = ((formData.get("radius") as string | null) ?? "").trim();
  if (radius) theme.radius = radius;

  const font = (formData.get("font") as string | null) ?? "";
  theme.font = VALID_FONTS.has(font) ? font : "Inter";

  const mode = (formData.get("mode") as string | null) ?? "";
  theme.mode = (VALID_MODES.has(mode) ? mode : "dark") as "dark" | "light";

  const buttonStyle = (formData.get("button_style") as string | null) ?? "";
  theme.button_style = (VALID_BUTTON_STYLES.has(buttonStyle) ? buttonStyle : "solid") as
    | "solid"
    | "outline";

  const supabase = await createClient();
  const { error } = await supabase
    .from("platform_settings")
    .update({
      platform_name: platformName,
      favicon_emoji: faviconEmoji,
      loading_message: loadingMessage,
      theme,
      updated_by: profile.user_id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);

  if (error) return { ok: false, error: error.message };

  await writeAuditLog({
    actorId: profile.user_id,
    action: "platform_settings.update",
    targetType: "platform_settings",
    targetId: "1",
    meta: { platform_name: platformName, favicon_emoji: faviconEmoji, theme },
  });

  // The root layout (src/app/layout.tsx) reads platform_settings for every
  // route in the app, including /login pre-auth — revalidate at the
  // "layout" level so the new theme/title/favicon apply everywhere on the
  // next request, not just under /admin/theme.
  revalidatePath("/", "layout");

  return { ok: true };
}
