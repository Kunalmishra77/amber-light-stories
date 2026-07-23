/**
 * Client-facing help for each provider credential — why it's needed, where to
 * get the key, and what the key looks like.
 *
 * Pure data (no server-only), so both the pre-login onboarding wizard AND the
 * in-portal API Management page render the SAME guidance. The audit found the
 * dashboard had none of this, leaving a non-technical client to guess.
 */
export interface ProviderHelp {
  /** Why this credential is needed, in plain language. */
  purpose: string;
  /** Where the client obtains the key. */
  website: string;
  websiteLabel: string;
  /** Short shape hint, e.g. "Starts with sk-". */
  keyHint: string;
  /** How the credential connects. */
  method: "api_key" | "oauth";
  /** Whether the client must provide this for the core loop to work. */
  required: boolean;
}

export const PROVIDER_HELP: Record<string, ProviderHelp> = {
  openai: {
    purpose: "Writes your stories, scripts, and video metadata (titles, descriptions, tags).",
    website: "https://platform.openai.com/api-keys",
    websiteLabel: "platform.openai.com/api-keys",
    keyHint: "Starts with sk-",
    method: "api_key",
    required: true,
  },
  gemini: {
    purpose: "Handles research, SEO, and trend & style analysis for each video.",
    website: "https://aistudio.google.com/apikey",
    websiteLabel: "aistudio.google.com/apikey",
    keyHint: "Starts with AIza",
    method: "api_key",
    required: true,
  },
  elevenlabs: {
    purpose: "Generates realistic voice narration for every video.",
    website: "https://elevenlabs.io/app/settings/api-keys",
    websiteLabel: "elevenlabs.io/app/settings/api-keys",
    keyHint: "Starts with xi-",
    method: "api_key",
    required: true,
  },
  fal: {
    purpose: "Renders cinematic images and AI video for your scenes.",
    website: "https://fal.ai/dashboard/keys",
    websiteLabel: "fal.ai/dashboard/keys",
    keyHint: "Format: key_id:key_secret",
    method: "api_key",
    required: true,
  },
  youtube: {
    purpose: "Publishes finished videos to your channel and reads their analytics.",
    website: "/youtube",
    websiteLabel: "Connect on the YouTube page",
    keyHint: "Connect with Google sign-in",
    method: "oauth",
    required: false,
  },
};

/** At least one text provider (OpenAI/Gemini) is required for real AI generation. */
export const AI_KEY_PROVIDERS = ["openai", "gemini", "elevenlabs", "fal"] as const;
