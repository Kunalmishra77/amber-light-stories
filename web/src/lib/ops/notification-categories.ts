/**
 * Notification categories — shared by the server notifier and the preferences
 * UI.
 *
 * Deliberately NOT marked `server-only` and deliberately free of imports: the
 * preferences screen is a client component, and pulling these constants from
 * `lib/ops/notify.ts` would drag its transitive server dependencies
 * (googleapis, node:fs, node:child_process) into the browser bundle.
 */
export const NOTIFICATION_CATEGORIES = [
  "review",
  "approval",
  "publishing",
  "incident",
  "quality",
  "billing",
  "general",
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];
export type NotificationSeverity = "info" | "warning" | "critical";

export const SEVERITY_RANK: Record<NotificationSeverity, number> = {
  info: 0,
  warning: 1,
  critical: 2,
};

export const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  review: "Review requests",
  approval: "Approval decisions",
  publishing: "Publishing",
  incident: "Incidents",
  quality: "Quality & compliance",
  billing: "Billing & usage",
  general: "General",
};

/** Defaults for a member who has never touched their preferences. */
export function defaultPreference(category: string) {
  return {
    category,
    in_app: true,
    email: category === "incident", // only genuinely interruptive categories email by default
    webhook: false,
    min_severity: "info" as NotificationSeverity,
  };
}
