"use client";

import { Globe2 } from "lucide-react";
import { updateRegionSettings } from "./actions";
import { SectionCard } from "./section-card";
import { SettingsForm } from "./settings-form";
import { CURRENCIES, DATE_FORMATS, FIELD_CLASS, LABEL_CLASS, TIMEZONES } from "./field-styles";

export interface RegionSettingsData {
  language: string;
  secondary_language: string;
  timezone: string;
  country: string;
  currency: string;
  date_format: string;
}

const LANGUAGES: [string, string][] = [
  ["en", "English"],
  ["hi", "Hindi"],
];

export function RegionForm({ data, canEdit }: { data: RegionSettingsData; canEdit: boolean }) {
  return (
    <SectionCard
      id="region"
      icon={Globe2}
      title="Language & Region"
      description="Narration language, timezone, and locale formatting for this workspace."
    >
      <SettingsForm action={updateRegionSettings} canEdit={canEdit} savedMessage="Language & region saved.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="language" className={LABEL_CLASS}>
              Language
            </label>
            <select id="language" name="language" defaultValue={data.language || "en"} className={FIELD_CLASS}>
              {LANGUAGES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="secondary_language" className={LABEL_CLASS}>
              Secondary language
            </label>
            <select
              id="secondary_language"
              name="secondary_language"
              defaultValue={data.secondary_language ?? ""}
              className={FIELD_CLASS}
            >
              <option value="">None</option>
              {LANGUAGES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="country" className={LABEL_CLASS}>
              Country
            </label>
            <input
              id="country"
              name="country"
              type="text"
              defaultValue={data.country}
              placeholder="e.g. India"
              className={FIELD_CLASS}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="timezone" className={LABEL_CLASS}>
              Timezone
            </label>
            <select id="timezone" name="timezone" defaultValue={data.timezone || "UTC"} className={FIELD_CLASS}>
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="currency" className={LABEL_CLASS}>
              Currency
            </label>
            <select id="currency" name="currency" defaultValue={data.currency || "USD"} className={FIELD_CLASS}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="date_format" className={LABEL_CLASS}>
              Date format
            </label>
            <select
              id="date_format"
              name="date_format"
              defaultValue={data.date_format || "YYYY-MM-DD"}
              className={FIELD_CLASS}
            >
              {DATE_FORMATS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </SettingsForm>
    </SectionCard>
  );
}
