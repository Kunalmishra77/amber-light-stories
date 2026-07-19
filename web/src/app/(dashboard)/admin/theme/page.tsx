import { Palette } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { DEFAULT_PLATFORM_SETTINGS, type PlatformSettings } from "@/lib/branding";
import { ThemeSettingsForm } from "./theme-settings-form";

// Reads the live platform_settings row on every request — never prerender.
export const dynamic = "force-dynamic";

async function loadPlatformSettings(): Promise<PlatformSettings | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("platform_settings")
    .select("platform_name, favicon_emoji, loading_message, theme")
    .eq("id", 1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    platform_name: data.platform_name || DEFAULT_PLATFORM_SETTINGS.platform_name,
    favicon_emoji: data.favicon_emoji || DEFAULT_PLATFORM_SETTINGS.favicon_emoji,
    loading_message: data.loading_message || DEFAULT_PLATFORM_SETTINGS.loading_message,
    theme: { ...DEFAULT_PLATFORM_SETTINGS.theme, ...(data.theme ?? {}) },
  };
}

export default async function AdminThemePage() {
  let settings: PlatformSettings | null = null;
  let errored = false;

  try {
    settings = await loadPlatformSettings();
  } catch {
    errored = true;
  }

  return (
    <div>
      <PageHeader
        title="Theme & Branding"
        description="Platform-wide brand and theme tokens — applies instantly to /login, /admin, and system chrome across every tenant. Tenant-specific themes come later."
      />

      {errored || !settings ? (
        <EmptyState
          icon={Palette}
          title="Couldn't load platform settings"
          description={
            errored
              ? "There was a problem reaching Supabase. Check the connection."
              : "No platform_settings row found — run the P6.1 migration."
          }
        />
      ) : (
        <ThemeSettingsForm settings={settings} />
      )}
    </div>
  );
}
