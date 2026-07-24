import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/** Theme tokens stored in `platform_settings.theme` (jsonb). */
export interface PlatformTheme {
  primary?: string;
  primary_hover?: string;
  accent?: string;
  sidebar?: string;
  background?: string;
  surface?: string;
  foreground?: string;
  radius?: string;
  font?: string;
  mode?: "dark" | "light";
  button_style?: "solid" | "outline";
}

export interface PlatformSettings {
  platform_name: string;
  favicon_emoji: string;
  loading_message: string;
  theme: PlatformTheme;
}

export interface TenantBrand {
  display_name: string;
  tagline: string | null;
  accent: string | null;
}

/**
 * Baked-in fallback — used whenever `platform_settings` is missing, RLS
 * blocks the read (shouldn't happen, it's public-read), or the query fails
 * for any other reason. Keeps /login and the root layout resilient even if
 * the DB is briefly unreachable.
 */
export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  platform_name: "YT-Automation",
  favicon_emoji: "🎬",
  loading_message: "Loading your studio...",
  theme: {
    // Brand: pink-600 primary (white text on it clears WCAG AA at 4.6:1),
    // pink-500 hover, blue CTA accent, on deep navy surfaces.
    primary: "#DB2777",
    primary_hover: "#EC4899",
    accent: "#2563EB",
    sidebar: "#0B1220",
    background: "#0F172A",
    surface: "#1E293B",
    foreground: "#F8FAFC",
    radius: "0.75rem",
    font: "Open Sans",
    mode: "dark",
    button_style: "solid",
  },
};

const DEFAULT_TENANT_BRAND: TenantBrand = {
  display_name: "Studio",
  tagline: null,
  accent: null,
};

/**
 * Reads the singleton `platform_settings` row (id=1). Uses the cookie-bound
 * authed client (works with either an anon or a signed-in session — the
 * table's `read_all` RLS policy grants select to both), so this is safe to
 * call from /login before the user is authenticated as well as from inside
 * the dashboard. Cached per request via React `cache`.
 */
export const getPlatformSettings = cache(async (): Promise<PlatformSettings> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("platform_settings")
      .select("platform_name, favicon_emoji, loading_message, theme")
      .eq("id", 1)
      .maybeSingle();

    if (error || !data) return DEFAULT_PLATFORM_SETTINGS;

    return {
      platform_name: data.platform_name || DEFAULT_PLATFORM_SETTINGS.platform_name,
      favicon_emoji: data.favicon_emoji || DEFAULT_PLATFORM_SETTINGS.favicon_emoji,
      loading_message: data.loading_message || DEFAULT_PLATFORM_SETTINGS.loading_message,
      theme: { ...DEFAULT_PLATFORM_SETTINGS.theme, ...((data.theme as PlatformTheme) ?? {}) },
    };
  } catch {
    return DEFAULT_PLATFORM_SETTINGS;
  }
});

/**
 * Reads `tenant_settings.brand` for the given tenant — the CLIENT brand,
 * shown only inside that tenant's workspace (sidebar), never on /login or
 * /admin. Falls back to a generic "Studio" label if the tenant has no brand
 * configured yet, or `tenantId` is null (no active membership).
 */
export const getTenantBrand = cache(
  async (tenantId: string | null): Promise<TenantBrand> => {
    if (!tenantId) return DEFAULT_TENANT_BRAND;

    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("tenant_settings")
        .select("brand")
        .eq("tenant_id", tenantId)
        .maybeSingle();

      const brand = (data?.brand ?? null) as Partial<TenantBrand> | null;
      if (error || !brand?.display_name) return DEFAULT_TENANT_BRAND;

      return {
        display_name: brand.display_name,
        tagline: brand.tagline ?? null,
        accent: brand.accent ?? null,
      };
    } catch {
      return DEFAULT_TENANT_BRAND;
    }
  }
);

/** Maps a `theme.font` token to a full CSS font-family stack. Only fonts the
 * root layout already SELF-HOSTS get a real variable — Open Sans (brand body
 * font), Poppins (display/headings) and Inter; no token triggers a network
 * fetch at build or runtime. "System" and "Geist" fall back to the OS stack. */
const OS_STACK = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Arial, sans-serif";

function fontStack(font?: string): string {
  switch (font) {
    case "System":
      return OS_STACK;
    case "Geist":
      return `'Geist', ${OS_STACK}`;
    case "Inter":
      return `var(--font-inter), ${OS_STACK}`;
    case "Poppins":
      return `var(--font-poppins), ${OS_STACK}`;
    case "Open Sans":
    default:
      return `var(--font-open-sans), ${OS_STACK}`;
  }
}

/**
 * Maps platform theme tokens to a flat CSS-custom-property object, meant to
 * be spread onto an element's inline `style`. Inline styles win over any
 * stylesheet rule (including the `.dark` overrides in globals.css) at equal
 * or lower specificity, so setting these on <body> is what makes the DB
 * theme override the static defaults without touching globals.css per
 * deploy. Only tokens the DB actually provided are included — callers
 * should still spread over sensible CSS defaults for anything omitted.
 */
export function themeToCssVars(theme: PlatformTheme): Record<string, string> {
  const vars: Record<string, string> = {};

  if (theme.primary) vars["--primary"] = theme.primary;
  if (theme.primary_hover) vars["--primary-hover"] = theme.primary_hover;
  if (theme.primary) vars["--ring"] = theme.primary;
  if (theme.accent) vars["--accent"] = theme.accent;
  if (theme.sidebar) vars["--sidebar"] = theme.sidebar;
  if (theme.background) vars["--background"] = theme.background;
  if (theme.surface) vars["--surface"] = theme.surface;
  if (theme.foreground) vars["--foreground"] = theme.foreground;
  if (theme.radius) vars["--radius"] = theme.radius;
  vars["--brand-font"] = fontStack(theme.font);

  return vars;
}

/** Builds an emoji favicon as a data-URI SVG — no binary asset needed. */
export function faviconDataUri(emoji: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='84'>${emoji}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
