"use client";

import { PenSquare } from "lucide-react";
import { updateContentSettings } from "./actions";
import { SectionCard } from "./section-card";
import { SettingsForm } from "./settings-form";
import { FIELD_CLASS, LABEL_CLASS, TARGET_PLATFORMS, UPLOAD_FREQUENCIES } from "./field-styles";

export interface ContentSettingsData {
  content_style: string;
  tone: string;
  keywords: string;
  negative_keywords: string;
  competitors: string;
  upload_frequency: string;
  target_platform: string;
}

export function ContentForm({ data, canEdit }: { data: ContentSettingsData; canEdit: boolean }) {
  return (
    <SectionCard
      id="content"
      icon={PenSquare}
      title="Content"
      description="Style, tone, and SEO signals used to plan and write every video."
    >
      <SettingsForm action={updateContentSettings} canEdit={canEdit} savedMessage="Content settings saved.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="content_style" className={LABEL_CLASS}>
              Content style
            </label>
            <input
              id="content_style"
              name="content_style"
              type="text"
              defaultValue={data.content_style}
              placeholder="e.g. Narrated animated shorts"
              className={FIELD_CLASS}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="tone" className={LABEL_CLASS}>
              Tone
            </label>
            <input
              id="tone"
              name="tone"
              type="text"
              defaultValue={data.tone}
              placeholder="e.g. Warm, inspiring"
              className={FIELD_CLASS}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="target_platform" className={LABEL_CLASS}>
              Target platform
            </label>
            <select
              id="target_platform"
              name="target_platform"
              defaultValue={data.target_platform || "youtube_shorts"}
              className={FIELD_CLASS}
            >
              {TARGET_PLATFORMS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="upload_frequency" className={LABEL_CLASS}>
              Upload frequency
            </label>
            <select
              id="upload_frequency"
              name="upload_frequency"
              defaultValue={data.upload_frequency ?? ""}
              className={FIELD_CLASS}
            >
              {UPLOAD_FREQUENCIES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="keywords" className={LABEL_CLASS}>
              Keywords
            </label>
            <input
              id="keywords"
              name="keywords"
              type="text"
              defaultValue={data.keywords}
              placeholder="Comma separated"
              className={FIELD_CLASS}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="negative_keywords" className={LABEL_CLASS}>
              Negative keywords
            </label>
            <input
              id="negative_keywords"
              name="negative_keywords"
              type="text"
              defaultValue={data.negative_keywords}
              placeholder="Comma separated — always avoid"
              className={FIELD_CLASS}
            />
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label htmlFor="competitors" className={LABEL_CLASS}>
              Competitors
            </label>
            <input
              id="competitors"
              name="competitors"
              type="text"
              defaultValue={data.competitors}
              placeholder="Comma separated"
              className={FIELD_CLASS}
            />
          </div>
        </div>
      </SettingsForm>
    </SectionCard>
  );
}
