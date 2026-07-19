/** Shared field styling for the Settings module's section forms. */
export const FIELD_CLASS =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50";
export const LABEL_CLASS = "text-xs font-medium text-foreground";
export const HELPER_CLASS = "text-xs text-muted-foreground";
export const TEXTAREA_CLASS = `${FIELD_CLASS} resize-y`;

export const TIMEZONES = [
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

export const CURRENCIES = ["USD", "INR", "EUR", "GBP", "AUD", "CAD", "JPY", "SGD", "AED"];

export const DATE_FORMATS: [string, string][] = [
  ["YYYY-MM-DD", "YYYY-MM-DD (2026-07-19)"],
  ["MM/DD/YYYY", "MM/DD/YYYY (07/19/2026)"],
  ["DD/MM/YYYY", "DD/MM/YYYY (19/07/2026)"],
  ["DD-MM-YYYY", "DD-MM-YYYY (19-07-2026)"],
];

export const CONTENT_OBJECTIVES: [string, string][] = [
  ["", "Select…"],
  ["subscriber_growth", "Subscriber growth"],
  ["watch_time", "Watch time"],
  ["brand_awareness", "Brand awareness"],
  ["community_engagement", "Community engagement"],
  ["lead_generation", "Lead generation"],
];

export const TARGET_PLATFORMS: [string, string][] = [
  ["youtube_shorts", "YouTube Shorts"],
  ["youtube_long", "YouTube (long-form)"],
  ["tiktok", "TikTok"],
  ["instagram_reels", "Instagram Reels"],
  ["multi_platform", "Multi-platform"],
];

export const UPLOAD_FREQUENCIES: [string, string][] = [
  ["", "Select…"],
  ["daily", "Daily"],
  ["3x_week", "3x / week"],
  ["weekly", "Weekly"],
  ["biweekly", "Biweekly"],
  ["monthly", "Monthly"],
];
