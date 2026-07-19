"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlatformSettings, PlatformTheme } from "@/lib/branding";
import { updatePlatformSettings } from "./actions";

const FIELD_CLASS =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary disabled:opacity-50";
const LABEL_CLASS = "text-xs font-medium text-foreground";

interface ColorFieldConfig {
  key: keyof PlatformTheme;
  label: string;
  fallback: string;
}

const COLOR_FIELDS: ColorFieldConfig[] = [
  { key: "primary", label: "Primary", fallback: "#F59E0B" },
  { key: "primary_hover", label: "Primary (hover)", fallback: "#FBBF24" },
  { key: "accent", label: "Accent", fallback: "#F59E0B" },
  { key: "sidebar", label: "Sidebar", fallback: "#0C0C0F" },
  { key: "background", label: "Background", fallback: "#0A0A0C" },
  { key: "surface", label: "Surface", fallback: "#141417" },
  { key: "foreground", label: "Foreground", fallback: "#FAFAFA" },
];

function ColorField({
  config,
  value,
  disabled,
  onChange,
}: {
  config: ColorFieldConfig;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const isHex = /^#[0-9a-fA-F]{6}$/.test(value);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={config.key} className={LABEL_CLASS}>
        {config.label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${config.label} color picker`}
          disabled={disabled}
          value={isHex ? value : config.fallback}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-border bg-surface p-1 disabled:opacity-50"
        />
        <input
          id={config.key}
          name={config.key}
          type="text"
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={config.fallback}
          className={cn(FIELD_CLASS, "font-mono")}
        />
      </div>
    </div>
  );
}

export function ThemeSettingsForm({ settings }: { settings: PlatformSettings }) {
  const [platformName, setPlatformName] = useState(settings.platform_name);
  const [faviconEmoji, setFaviconEmoji] = useState(settings.favicon_emoji);
  const [loadingMessage, setLoadingMessage] = useState(settings.loading_message);
  const [theme, setTheme] = useState<PlatformTheme>(settings.theme);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function setColor(key: keyof PlatformTheme, value: string) {
    setTheme((t) => ({ ...t, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await updatePlatformSettings(formData);
      if (!result.ok) {
        setError(result.error ?? "Couldn't save theme settings.");
        return;
      }
      setSaved(true);
    });
  }

  const previewStyle = useMemo(
    () =>
      ({
        "--preview-primary": theme.primary || "#F59E0B",
        "--preview-primary-hover": theme.primary_hover || "#FBBF24",
        "--preview-accent": theme.accent || theme.primary || "#F59E0B",
        "--preview-sidebar": theme.sidebar || "#0C0C0F",
        "--preview-background": theme.background || "#0A0A0C",
        "--preview-surface": theme.surface || "#141417",
        "--preview-foreground": theme.foreground || "#FAFAFA",
        "--preview-radius": theme.radius || "0.75rem",
      }) as React.CSSProperties,
    [theme]
  );

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8">
      {/* Live preview */}
      <div style={previewStyle} className="rounded-xl border border-border p-5">
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Live preview
        </p>
        <div
          className="flex flex-col gap-3 rounded-lg p-4"
          style={{
            background: "var(--preview-background)",
            borderRadius: "var(--preview-radius)",
          }}
        >
          <div className="flex items-center justify-between">
            <div
              className="flex items-center gap-2 rounded-lg px-3 py-2"
              style={{
                background: "var(--preview-sidebar)",
                borderRadius: "var(--preview-radius)",
              }}
            >
              <span className="text-lg" aria-hidden="true">
                {faviconEmoji || "🎬"}
              </span>
              <span
                className="text-sm font-semibold"
                style={{ color: "var(--preview-foreground)" }}
              >
                {platformName || "YT Automation"}
              </span>
            </div>
            <span
              className="rounded-full px-2.5 py-1 text-[11px] font-medium"
              style={{
                background: "var(--preview-accent)",
                color: "#1a1206",
              }}
            >
              Accent chip
            </span>
          </div>
          <div
            className="rounded-lg p-3"
            style={{
              background: "var(--preview-surface)",
              borderRadius: "var(--preview-radius)",
            }}
          >
            <p className="mb-2 text-xs" style={{ color: "var(--preview-foreground)" }}>
              {loadingMessage || "Loading your studio..."}
            </p>
            <button
              type="button"
              tabIndex={-1}
              className="inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
              style={
                theme.button_style === "outline"
                  ? {
                      background: "transparent",
                      border: "1px solid var(--preview-primary)",
                      color: "var(--preview-primary)",
                      borderRadius: "var(--preview-radius)",
                    }
                  : {
                      background: "var(--preview-primary)",
                      color: "#1a1206",
                      borderRadius: "var(--preview-radius)",
                    }
              }
            >
              Primary button
            </button>
          </div>
        </div>
      </div>

      {/* Platform identity */}
      <div className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-elevated p-5 shadow-sm sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="platform_name" className={LABEL_CLASS}>
            Platform name
          </label>
          <input
            id="platform_name"
            name="platform_name"
            type="text"
            required
            disabled={isPending}
            value={platformName}
            onChange={(e) => setPlatformName(e.target.value)}
            className={FIELD_CLASS}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="favicon_emoji" className={LABEL_CLASS}>
            Favicon emoji
          </label>
          <input
            id="favicon_emoji"
            name="favicon_emoji"
            type="text"
            required
            maxLength={8}
            disabled={isPending}
            value={faviconEmoji}
            onChange={(e) => setFaviconEmoji(e.target.value)}
            className={FIELD_CLASS}
          />
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="loading_message" className={LABEL_CLASS}>
            Loading message
          </label>
          <input
            id="loading_message"
            name="loading_message"
            type="text"
            disabled={isPending}
            value={loadingMessage}
            onChange={(e) => setLoadingMessage(e.target.value)}
            className={FIELD_CLASS}
          />
        </div>
      </div>

      {/* Theme tokens */}
      <div className="rounded-xl border border-border bg-elevated p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-foreground">Theme tokens</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {COLOR_FIELDS.map((config) => (
            <ColorField
              key={config.key}
              config={config}
              value={(theme[config.key] as string) ?? ""}
              disabled={isPending}
              onChange={(v) => setColor(config.key, v)}
            />
          ))}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="radius" className={LABEL_CLASS}>
              Corner radius
            </label>
            <input
              id="radius"
              name="radius"
              type="text"
              disabled={isPending}
              value={theme.radius ?? ""}
              onChange={(e) => setTheme((t) => ({ ...t, radius: e.target.value }))}
              placeholder="0.75rem"
              className={FIELD_CLASS}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="font" className={LABEL_CLASS}>
              Font
            </label>
            <select
              id="font"
              name="font"
              disabled={isPending}
              value={theme.font ?? "Inter"}
              onChange={(e) => setTheme((t) => ({ ...t, font: e.target.value }))}
              className={FIELD_CLASS}
            >
              <option value="Inter">Inter</option>
              <option value="System">System</option>
              <option value="Geist">Geist</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="mode" className={LABEL_CLASS}>
              Default mode
            </label>
            <select
              id="mode"
              name="mode"
              disabled={isPending}
              value={theme.mode ?? "dark"}
              onChange={(e) =>
                setTheme((t) => ({ ...t, mode: e.target.value as "dark" | "light" }))
              }
              className={FIELD_CLASS}
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="button_style" className={LABEL_CLASS}>
              Button style
            </label>
            <select
              id="button_style"
              name="button_style"
              disabled={isPending}
              value={theme.button_style ?? "solid"}
              onChange={(e) =>
                setTheme((t) => ({
                  ...t,
                  button_style: e.target.value as "solid" | "outline",
                }))
              }
              className={FIELD_CLASS}
            >
              <option value="solid">Solid</option>
              <option value="outline">Outline</option>
            </select>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        These apply platform-wide instantly (title, favicon, and theme colors on
        every route, including /login). Tenant-specific themes come later.
      </p>

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-[var(--status-failed)]/30 bg-[var(--status-failed)]/10 px-3 py-2 text-xs text-[var(--status-failed)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          <span>{error}</span>
        </div>
      ) : null}

      {saved && !error ? (
        <div className="flex items-start gap-2 rounded-lg border border-[var(--status-approved)]/30 bg-[var(--status-approved)]/10 px-3 py-2 text-xs text-[var(--status-approved)]">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          <span>Platform theme saved — reload any page to see it applied.</span>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Save className="h-3.5 w-3.5" strokeWidth={2} />
        {isPending ? "Saving…" : "Save theme"}
      </button>
    </form>
  );
}
