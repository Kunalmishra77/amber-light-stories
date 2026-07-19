import { Sparkles, Gem, AudioLines, Clapperboard, SquarePlay, Mail, type LucideIcon } from "lucide-react";
import type { CredentialProvider } from "@/lib/onboarding/types";

export interface RequiredProviderMeta {
  key: CredentialProvider;
  label: string;
  icon: LucideIcon;
  color: string;
  purpose: string;
  scope: string;
  website: string;
  websiteLabel: string;
  docs: string;
  steps: string[];
  placeholder: string;
  keyHint: string;
}

export interface OptionalProviderMeta {
  key: CredentialProvider;
  label: string;
  icon: LucideIcon;
  color: string;
  purpose: string;
  note: string;
  website: string;
  websiteLabel: string;
}

/** Rich, per-provider education content for the API setup step. */
export const REQUIRED_PROVIDER_META: RequiredProviderMeta[] = [
  {
    key: "openai",
    label: "OpenAI",
    icon: Sparkles,
    color: "#10A37F",
    purpose: "Writes your stories, scripts, and video metadata (titles, descriptions, tags).",
    scope: "API key with default permissions",
    website: "https://platform.openai.com/api-keys",
    websiteLabel: "platform.openai.com/api-keys",
    docs: "https://platform.openai.com/docs/quickstart",
    steps: [
      "Sign in at platform.openai.com",
      'Go to "API Keys" in the left sidebar',
      'Click "Create new secret key"',
      "Copy it — it starts with sk-…",
      "(Optional) Set a monthly budget so spend never surprises you",
    ],
    placeholder: "sk-…",
    keyHint: "Starts with sk-",
  },
  {
    key: "gemini",
    label: "Google Gemini",
    icon: Gem,
    color: "#4285F4",
    purpose: "Handles research, SEO, and trend & style analysis for each video.",
    scope: "Generative Language API key",
    website: "https://aistudio.google.com/apikey",
    websiteLabel: "aistudio.google.com/apikey",
    docs: "https://ai.google.dev/gemini-api/docs",
    steps: ['Open Google AI Studio', 'Click "Get API key" / "Create API key"', "Copy the key"],
    placeholder: "AIza…",
    keyHint: "Starts with AIza",
  },
  {
    key: "elevenlabs",
    label: "ElevenLabs",
    icon: AudioLines,
    color: "#000000",
    purpose: "Generates realistic voice narration for every video.",
    scope: "Full-account API key",
    website: "https://elevenlabs.io/app/settings/api-keys",
    websiteLabel: "elevenlabs.io/app/settings/api-keys",
    docs: "https://elevenlabs.io/docs",
    steps: ["Sign in at elevenlabs.io", 'Go to Profile → "API Keys"', "Create the key and copy it"],
    placeholder: "xi-…",
    keyHint: "Starts with xi-",
  },
  {
    key: "fal",
    label: "fal.ai",
    icon: Clapperboard,
    color: "#7C3AED",
    purpose: "Renders cinematic images and AI video for your scenes, with consistent characters.",
    scope: "Account API key",
    website: "https://fal.ai/dashboard/keys",
    websiteLabel: "fal.ai/dashboard/keys",
    docs: "https://docs.fal.ai",
    steps: [
      "Sign in at fal.ai",
      'Go to Dashboard → "Keys"',
      'Click "Add key"',
      "Copy it — format is key_id:key_secret",
      "Add a small credit balance so renders don't stall",
    ],
    placeholder: "key_id:key_secret",
    keyHint: "Format: id:secret",
  },
];

export const OPTIONAL_PROVIDER_META: OptionalProviderMeta[] = [
  {
    key: "youtube",
    label: "YouTube",
    icon: SquarePlay,
    color: "#FF0000",
    purpose: "Publishes finished videos straight to your channel.",
    note: "Connect via Google after approval (OAuth) — optional now.",
    website: "https://console.cloud.google.com",
    websiteLabel: "console.cloud.google.com",
  },
  {
    key: "gmail",
    label: "Gmail",
    icon: Mail,
    color: "#EA4335",
    purpose: "Emails you the moment a new video publishes.",
    note: "Connect via Google after approval (OAuth) — optional now.",
    website: "https://console.cloud.google.com",
    websiteLabel: "console.cloud.google.com",
  },
];
