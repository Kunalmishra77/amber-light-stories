"use client";

import { Briefcase } from "lucide-react";
import { updateBusinessSettings } from "./actions";
import { SectionCard } from "./section-card";
import { SettingsForm } from "./settings-form";
import { CONTENT_OBJECTIVES, FIELD_CLASS, LABEL_CLASS, TEXTAREA_CLASS } from "./field-styles";

export interface BusinessSettingsData {
  industry: string;
  target_audience: string;
  business_goals: string;
  content_objective: string;
}

export function BusinessForm({ data, canEdit }: { data: BusinessSettingsData; canEdit: boolean }) {
  return (
    <SectionCard
      id="business"
      icon={Briefcase}
      title="Business"
      description="What your business does and who it's for — this steers topic selection and script tone."
    >
      <SettingsForm action={updateBusinessSettings} canEdit={canEdit} savedMessage="Business details saved.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="industry" className={LABEL_CLASS}>
              Industry
            </label>
            <input
              id="industry"
              name="industry"
              type="text"
              defaultValue={data.industry}
              placeholder="e.g. Media & Entertainment"
              className={FIELD_CLASS}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="content_objective" className={LABEL_CLASS}>
              Content objective
            </label>
            <select
              id="content_objective"
              name="content_objective"
              defaultValue={data.content_objective}
              className={FIELD_CLASS}
            >
              {CONTENT_OBJECTIVES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label htmlFor="target_audience" className={LABEL_CLASS}>
              Target audience
            </label>
            <input
              id="target_audience"
              name="target_audience"
              type="text"
              defaultValue={data.target_audience}
              placeholder="e.g. Parents of kids 4–9"
              className={FIELD_CLASS}
            />
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label htmlFor="business_goals" className={LABEL_CLASS}>
              Business goals
            </label>
            <textarea
              id="business_goals"
              name="business_goals"
              rows={3}
              defaultValue={data.business_goals}
              placeholder="What does success look like for this channel?"
              className={TEXTAREA_CLASS}
            />
          </div>
        </div>
      </SettingsForm>
    </SectionCard>
  );
}
