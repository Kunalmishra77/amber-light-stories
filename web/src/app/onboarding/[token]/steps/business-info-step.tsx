"use client";

import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { FIELD_CLASS, HELPER_CLASS, LABEL_CLASS, TEXTAREA_CLASS } from "../field-styles";
import type { BusinessInfo } from "@/lib/onboarding/types";

const TIMEZONES = [
  "UTC",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Madrid",
  "Africa/Lagos",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
];

interface BusinessInfoStepProps {
  defaultValues: BusinessInfo;
  isPending: boolean;
  error: string | null;
  onSubmit: (formData: FormData) => void;
}

export function BusinessInfoStep({ defaultValues: v, isPending, error, onSubmit }: BusinessInfoStepProps) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(new FormData(event.currentTarget));
      }}
      className="flex flex-col gap-6 rounded-2xl border border-border bg-elevated p-6 shadow-xl shadow-black/5 dark:shadow-black/40 sm:p-8"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-foreground">Tell us about your business</h2>
        <p className="text-sm text-muted-foreground">
          This shapes every script, voice, and visual we generate for you.
        </p>
      </div>

      <Section title="Business basics">
        <Field
          label="Business name"
          name="business_name"
          defaultValue={v.business_name}
          required
          helper="Shown across your dashboard, reports, and reviewer notes."
        />
        <Field
          label="Brand name"
          name="brand_name"
          defaultValue={v.brand_name}
          helper="How your channel is referred to in scripts and captions."
        />
        <Field
          label="Website"
          name="website"
          defaultValue={v.website}
          placeholder="https://…"
          helper="Helps the AI match your existing brand voice, if you have one."
        />
        <Field
          label="Industry"
          name="industry"
          defaultValue={v.industry}
          placeholder="e.g. Media & Entertainment"
          helper="Guides trend research and topic selection."
        />
      </Section>

      <Section title="Audience & goals">
        <Field
          label="Target audience"
          name="target_audience"
          defaultValue={v.target_audience}
          placeholder="e.g. Parents of kids 4–9"
          className="sm:col-span-2"
          helper="Every story is written to speak directly to this audience."
        />
        <Field
          label="Business goals"
          name="business_goals"
          defaultValue={v.business_goals}
          className="sm:col-span-2"
          textarea
          helper="Tells the AI what success looks like for you."
        />
        <SelectField
          label="Content objective"
          name="content_objective"
          defaultValue={v.content_objective}
          options={[
            ["", "Select…"],
            ["subscriber_growth", "Subscriber growth"],
            ["watch_time", "Watch time"],
            ["brand_awareness", "Brand awareness"],
            ["community_engagement", "Community engagement"],
            ["lead_generation", "Lead generation"],
          ]}
          helper="Scripts and hooks are optimized toward this goal."
        />
      </Section>

      <Section title="Localization">
        <Field
          label="Country"
          name="country"
          defaultValue={v.country}
          placeholder="e.g. India"
          helper="Country + language shape your stories and voice."
        />
        <SelectField
          label="Timezone"
          name="timezone"
          defaultValue={v.timezone || "UTC"}
          options={TIMEZONES.map((tz) => [tz, tz] as [string, string])}
          helper="Controls when your videos are scheduled and published."
        />
        <SelectField
          label="Language"
          name="language"
          defaultValue={v.language || "en"}
          options={[
            ["en", "English"],
            ["hi", "Hindi"],
          ]}
          helper="Sets the narration language for every video."
        />
        <SelectField
          label="Secondary language"
          name="secondary_language"
          defaultValue={v.secondary_language || ""}
          options={[
            ["", "None"],
            ["en", "English"],
            ["hi", "Hindi"],
          ]}
          helper="Optional — for bilingual captions or alternate cuts."
        />
      </Section>

      <Section title="Brand">
        <Field
          label="Brand description"
          name="brand_description"
          defaultValue={v.brand_description}
          className="sm:col-span-2"
          textarea
          helper="Gives the AI a feel for who you are, in your own words."
        />
        <Field
          label="Brand colors"
          name="brand_colors"
          defaultValue={v.brand_colors}
          placeholder="e.g. amber, charcoal"
          helper="Used for on-screen text, thumbnails, and overlays."
        />
        <Field
          label="Tone"
          name="tone"
          defaultValue={v.tone}
          placeholder="e.g. Warm, inspiring"
          helper="Sets the mood and style of every script."
        />
        <Field
          label="CTA style"
          name="cta_style"
          defaultValue={v.cta_style}
          placeholder="e.g. Soft ask to subscribe"
          helper="How each video asks viewers to engage."
        />
      </Section>

      <Section title="Content strategy">
        <Field
          label="Content style"
          name="content_style"
          defaultValue={v.content_style}
          placeholder="e.g. Narrated animated shorts"
          helper="Defines the visual and pacing style of your scenes."
        />
        <SelectField
          label="Target platform"
          name="target_platform"
          defaultValue={v.target_platform || "youtube_shorts"}
          options={[
            ["youtube_shorts", "YouTube Shorts"],
            ["youtube_long", "YouTube (long-form)"],
            ["tiktok", "TikTok"],
            ["instagram_reels", "Instagram Reels"],
            ["multi_platform", "Multi-platform"],
          ]}
          helper="Determines aspect ratio and length for every video."
        />
        <SelectField
          label="Upload frequency"
          name="upload_frequency"
          defaultValue={v.upload_frequency || ""}
          options={[
            ["", "Select…"],
            ["daily", "Daily"],
            ["3x_week", "3x / week"],
            ["weekly", "Weekly"],
            ["biweekly", "Biweekly"],
            ["monthly", "Monthly"],
          ]}
          helper="Sets your automated publishing cadence."
        />
        <Field
          label="Competitors"
          name="competitors"
          defaultValue={v.competitors}
          placeholder="Comma separated"
          helper="Helps the AI position your content differently."
        />
        <Field
          label="Keywords"
          name="keywords"
          defaultValue={v.keywords}
          placeholder="Comma separated"
          helper="Guides topic selection and SEO tagging."
        />
        <Field
          label="Negative keywords"
          name="negative_keywords"
          defaultValue={v.negative_keywords}
          placeholder="Comma separated"
          helper="Topics or terms to always avoid."
        />
      </Section>

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-[var(--status-failed)]/30 bg-[var(--status-failed)]/10 px-3 py-2 text-xs text-[var(--status-failed)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="flex items-center justify-end">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Continue"}
        </button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-5 first:border-t-0 first:pt-0">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  required,
  className,
  textarea,
  helper,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
  textarea?: boolean;
  helper?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <label htmlFor={name} className={LABEL_CLASS}>
        {label} {required ? <span className="text-primary">*</span> : null}
      </label>
      {textarea ? (
        <textarea
          id={name}
          name={name}
          defaultValue={defaultValue}
          placeholder={placeholder}
          rows={2}
          className={TEXTAREA_CLASS}
        />
      ) : (
        <input
          id={name}
          name={name}
          type="text"
          defaultValue={defaultValue}
          placeholder={placeholder}
          required={required}
          className={FIELD_CLASS}
        />
      )}
      {helper ? <p className={HELPER_CLASS}>{helper}</p> : null}
    </div>
  );
}

function SelectField({
  label,
  name,
  defaultValue,
  options,
  helper,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  options: [string, string][];
  helper?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className={LABEL_CLASS}>
        {label}
      </label>
      <select id={name} name={name} defaultValue={defaultValue} className={FIELD_CLASS}>
        {options.map(([val, optLabel]) => (
          <option key={val} value={val}>
            {optLabel}
          </option>
        ))}
      </select>
      {helper ? <p className={HELPER_CLASS}>{helper}</p> : null}
    </div>
  );
}
