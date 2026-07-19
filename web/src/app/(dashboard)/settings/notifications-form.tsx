"use client";

import { Bell } from "lucide-react";
import { updateNotificationSettings } from "./actions";
import { SectionCard } from "./section-card";
import { SettingsForm } from "./settings-form";

export interface NotificationPreferences {
  on_publish: boolean;
  on_approval_needed: boolean;
  on_failure: boolean;
}

const OPTIONS: { key: keyof NotificationPreferences; label: string; description: string }[] = [
  { key: "on_publish", label: "A video publishes", description: "Get notified the moment a video goes live." },
  {
    key: "on_approval_needed",
    label: "Something needs your approval",
    description: "A pipeline stage or plan item is waiting for review.",
  },
  { key: "on_failure", label: "Something fails", description: "A pipeline stage, render, or upload errors out." },
];

export function NotificationsForm({
  preferences,
  canEdit,
}: {
  preferences: NotificationPreferences;
  canEdit: boolean;
}) {
  return (
    <SectionCard
      id="notifications"
      icon={Bell}
      title="Notifications"
      description="Choose when this workspace sends you an email."
    >
      <SettingsForm
        action={updateNotificationSettings}
        canEdit={canEdit}
        savedMessage="Notification preferences saved."
      >
        <div className="flex flex-col divide-y divide-border">
          {OPTIONS.map((opt) => (
            <label
              key={opt.key}
              htmlFor={opt.key}
              className="flex cursor-pointer items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
            >
              <div>
                <p className="text-sm font-medium text-foreground">{opt.label}</p>
                <p className="text-xs text-muted-foreground">{opt.description}</p>
              </div>
              <input
                id={opt.key}
                name={opt.key}
                type="checkbox"
                defaultChecked={preferences[opt.key]}
                className="h-4 w-4 shrink-0 accent-[var(--primary)] disabled:opacity-50"
              />
            </label>
          ))}
        </div>
      </SettingsForm>
    </SectionCard>
  );
}
