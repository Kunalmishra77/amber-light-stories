/**
 * Shared shapes for the S3 client onboarding flow: the public token-gated
 * wizard (src/app/onboarding/[token]) and the super-admin review UI
 * (src/app/(dashboard)/admin/onboarding).
 */

export interface BusinessInfo {
  business_name?: string;
  brand_name?: string;
  website?: string;
  country?: string;
  timezone?: string;
  target_audience?: string;
  industry?: string;
  language?: string;
  secondary_language?: string;
  brand_description?: string;
  business_goals?: string;
  content_style?: string;
  target_platform?: string;
  upload_frequency?: string;
  brand_colors?: string;
  tone?: string;
  competitors?: string;
  keywords?: string;
  negative_keywords?: string;
  cta_style?: string;
  content_objective?: string;
}

/** Keys collected on the business-info step, in the order they're saved. */
export const BUSINESS_INFO_KEYS: (keyof BusinessInfo)[] = [
  "business_name",
  "brand_name",
  "website",
  "country",
  "timezone",
  "target_audience",
  "industry",
  "language",
  "secondary_language",
  "brand_description",
  "business_goals",
  "content_style",
  "target_platform",
  "upload_frequency",
  "brand_colors",
  "tone",
  "competitors",
  "keywords",
  "negative_keywords",
  "cta_style",
  "content_objective",
];

export type CredentialProvider = "openai" | "gemini" | "elevenlabs" | "fal" | "youtube" | "gmail";

export type CredentialStatus =
  | "not_started"
  | "connected"
  | "invalid"
  | "quota_exceeded"
  | "expired"
  | "error";

export interface ApiStatusEntry {
  status: CredentialStatus;
  message?: string;
  checkedAt?: string;
}

export type ApiStatus = Partial<Record<CredentialProvider, ApiStatusEntry>>;

/** These four must all read "connected" before the wizard can submit. */
export const REQUIRED_PROVIDERS: CredentialProvider[] = ["openai", "gemini", "elevenlabs", "fal"];

export type OnboardingStatus =
  | "created"
  | "in_progress"
  | "submitted"
  | "approved"
  | "rejected"
  | "changes_requested";

export interface OnboardingRecord {
  id: string;
  tenant_id: string;
  status: OnboardingStatus;
  business_info: BusinessInfo;
  api_status: ApiStatus;
  link_token: string;
  owner_email: string | null;
  submitted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  notes: string | null;
  created_at: string;
}
