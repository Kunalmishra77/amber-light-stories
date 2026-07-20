/**
 * Public-API constants shared by server (auth/dispatch) and client (forms).
 * Kept free of `server-only` so the tenant Developer UI can render the scope
 * and event checklists from the same source of truth (M8 / P2-12).
 */
export const API_SCOPES = ["read", "stories:read", "pipeline:read"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export const WEBHOOK_EVENT_TYPES = ["story.generated", "pipeline.completed", "pipeline.failed"] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];
