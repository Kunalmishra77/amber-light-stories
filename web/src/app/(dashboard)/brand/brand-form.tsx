"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, Paintbrush, Save, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { updateBrandKit, uploadBrandLogo, type TenantBrandFull } from "./actions";

const FIELD_CLASS =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary disabled:opacity-50";
const LABEL_CLASS = "text-xs font-medium text-foreground";

const FONT_OPTIONS = ["Inter", "Geist", "System"];

interface BrandFormProps {
  brand: TenantBrandFull;
  /** Signed URL for the logo preview (the private bucket path in
   * brand.logo_url isn't directly loadable). */
  logoDisplayUrl: string | null;
  canEdit: boolean;
}

export function BrandForm({ brand, logoDisplayUrl, canEdit }: BrandFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // `logoPath` is the STABLE bucket path we persist + round-trip; `logoUrl` is
  // the short-lived signed URL (or a local object-URL preview) we display.
  const [logoPath, setLogoPath] = useState<string | null>(brand.logo_url);
  const [logoUrl, setLogoUrl] = useState<string | null>(logoDisplayUrl);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isUploading, startUpload] = useTransition();
  const logoFormRef = useRef<HTMLFormElement>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    const formData = new FormData(event.currentTarget);
    // Round-trip the PATH (not the signed display URL), so a token'd URL is
    // never persisted into logo_url.
    formData.set("existing_logo_url", logoPath ?? "");

    startTransition(async () => {
      const result = await updateBrandKit(formData);
      if (!result.ok) {
        setError(result.error ?? "Couldn't save the brand kit.");
        return;
      }
      setSaved(true);
    });
  }

  function handleLogoSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLogoError(null);
    const formData = new FormData(event.currentTarget);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setLogoError("Choose an image file to upload.");
      return;
    }
    const preview = URL.createObjectURL(file);
    setLogoUrl(preview);

    startUpload(async () => {
      const result = await uploadBrandLogo(formData);
      if (!result.ok) {
        setLogoError(result.error ?? "Upload failed. Please try again.");
        setLogoUrl(logoDisplayUrl);
        return;
      }
      if (result.logoUrl) setLogoUrl(result.logoUrl);
      if (result.logoPath) setLogoPath(result.logoPath);
      logoFormRef.current?.reset();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Logo */}
      <div className="rounded-xl border border-border bg-elevated p-5 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Paintbrush className="h-4 w-4 text-primary" strokeWidth={1.75} />
          Logo
        </h2>
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-surface">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL
              <img src={logoUrl} alt="Workspace logo" className="h-full w-full object-contain" />
            ) : (
              <Paintbrush className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
            )}
          </div>
          {canEdit ? (
            <form ref={logoFormRef} onSubmit={handleLogoSubmit} className="flex flex-1 flex-col gap-2">
              <input
                type="file"
                name="file"
                accept="image/*"
                disabled={isUploading}
                className="w-full text-xs text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary hover:file:bg-primary/15 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={isUploading}
                className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
              >
                <UploadCloud className="h-3.5 w-3.5" strokeWidth={1.75} />
                {isUploading ? "Uploading…" : "Upload logo"}
              </button>
              {logoError ? (
                <span className="text-xs text-[var(--status-failed)]">{logoError}</span>
              ) : (
                <span className="text-xs text-muted-foreground">PNG or SVG works best, transparent background.</span>
              )}
            </form>
          ) : (
            <p className="text-xs text-muted-foreground">Only owners or managers can update the logo.</p>
          )}
        </div>
      </div>

      {/* Text fields */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-elevated p-5 shadow-sm sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="display_name" className={LABEL_CLASS}>
              Display name
            </label>
            <input
              id="display_name"
              name="display_name"
              type="text"
              required
              disabled={!canEdit || isPending}
              defaultValue={brand.display_name}
              placeholder="e.g. your brand name"
              className={FIELD_CLASS}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="tagline" className={LABEL_CLASS}>
              Tagline
            </label>
            <input
              id="tagline"
              name="tagline"
              type="text"
              disabled={!canEdit || isPending}
              defaultValue={brand.tagline ?? ""}
              placeholder="e.g. Studio"
              className={FIELD_CLASS}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="accent" className={LABEL_CLASS}>
              Accent color
            </label>
            <div className="flex items-center gap-2">
              <input
                id="accent"
                name="accent"
                type="text"
                disabled={!canEdit || isPending}
                defaultValue={brand.accent ?? "#F59E0B"}
                placeholder="#F59E0B"
                pattern="^#[0-9a-fA-F]{6}$"
                className={cn(FIELD_CLASS, "font-mono")}
              />
              <span
                className="h-9 w-9 shrink-0 rounded-lg border border-border"
                style={{ backgroundColor: brand.accent ?? "#F59E0B" }}
                aria-hidden="true"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="font" className={LABEL_CLASS}>
              Primary font
            </label>
            <select
              id="font"
              name="font"
              disabled={!canEdit || isPending}
              defaultValue={brand.font ?? "Inter"}
              className={FIELD_CLASS}
            >
              {FONT_OPTIONS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label htmlFor="voice_tone" className={LABEL_CLASS}>
              Brand voice &amp; tone
            </label>
            <textarea
              id="voice_tone"
              name="voice_tone"
              rows={3}
              disabled={!canEdit || isPending}
              defaultValue={brand.voice_tone ?? ""}
              placeholder="e.g. Warm, storytelling, gentle moral lessons — never preachy."
              className={cn(FIELD_CLASS, "resize-y")}
            />
            <p className="text-xs text-muted-foreground">
              Used to steer copy tone across generated content (mocked today; feeds the real AI
              pipeline once paid generation is enabled).
            </p>
          </div>
        </div>

        {error ? (
          <div className="flex items-start gap-2 rounded-lg border border-[var(--status-failed)]/30 bg-[var(--status-failed)]/10 px-3 py-2 text-xs text-[var(--status-failed)]">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            <span>{error}</span>
          </div>
        ) : null}

        {saved && !error ? (
          <div className="flex items-start gap-2 rounded-lg border border-[var(--status-approved)]/30 bg-[var(--status-approved)]/10 px-3 py-2 text-xs text-[var(--status-approved)]">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            <span>Brand kit saved.</span>
          </div>
        ) : null}

        {canEdit ? (
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" strokeWidth={2} />
            {isPending ? "Saving…" : "Save brand kit"}
          </button>
        ) : null}
      </form>
    </div>
  );
}
