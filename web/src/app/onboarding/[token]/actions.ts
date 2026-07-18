"use server";

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadOnboardingByToken } from "@/lib/onboarding/token";
import {
  BUSINESS_INFO_KEYS,
  REQUIRED_PROVIDERS,
  type ApiStatus,
  type BusinessInfo,
  type CredentialProvider,
  type CredentialStatus,
} from "@/lib/onboarding/types";

export interface WizardActionResult {
  ok: boolean;
  error?: string;
  info?: BusinessInfo;
}

export interface ValidateResult {
  status: CredentialStatus;
  message: string;
}

export interface OnboardingStatusResult {
  status: string;
  notes: string | null;
}

/** Onboardings that have already been approved are locked — no further writes. */
function assertEditable(status: string): string | null {
  if (status === "approved") {
    return "This onboarding has already been approved and can no longer be edited.";
  }
  return null;
}

function toArray(value?: string): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Saves step 1 (business info) into onboarding.business_info, flips
 * created -> in_progress, and mirrors the relevant fields into
 * tenant_settings so the rest of the platform (prompts, routing, etc.) sees
 * them immediately. Always re-derives the onboarding row from the token —
 * never trust a client-supplied id.
 */
export async function saveBusinessInfoAction(
  token: string,
  formData: FormData
): Promise<WizardActionResult> {
  const onboarding = await loadOnboardingByToken(token);
  if (!onboarding) return { ok: false, error: "Invalid or expired onboarding link." };

  const lockError = assertEditable(onboarding.status);
  if (lockError) return { ok: false, error: lockError };

  const info: BusinessInfo = { ...onboarding.business_info };
  for (const key of BUSINESS_INFO_KEYS) {
    const raw = formData.get(key);
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (trimmed) info[key] = trimmed;
    else delete info[key];
  }

  if (!info.business_name) {
    return { ok: false, error: "Business name is required." };
  }

  const admin = createAdminClient();
  const nextStatus = onboarding.status === "created" ? "in_progress" : onboarding.status;

  const { error: onboardingError } = await admin
    .from("onboarding")
    .update({ business_info: info, status: nextStatus })
    .eq("id", onboarding.id);
  if (onboardingError) return { ok: false, error: onboardingError.message };

  const { error: settingsError } = await admin
    .from("tenant_settings")
    .update({
      country: info.country || null,
      timezone: info.timezone || "UTC",
      language: info.language || "en",
      secondary_language: info.secondary_language || null,
      industry: info.industry || null,
      content_style: info.content_style || null,
      tone: info.tone || null,
      upload_frequency: info.upload_frequency || null,
      target_platform: info.target_platform || "youtube_shorts",
      keywords: toArray(info.keywords),
      negative_keywords: toArray(info.negative_keywords),
      competitors: toArray(info.competitors),
      audience: { target_audience: info.target_audience || null },
      brand: {
        brand_name: info.brand_name || null,
        website: info.website || null,
        brand_description: info.brand_description || null,
        business_goals: info.business_goals || null,
        brand_colors: info.brand_colors || null,
        cta_style: info.cta_style || null,
        content_objective: info.content_objective || null,
      },
    })
    .eq("tenant_id", onboarding.tenant_id);
  if (settingsError) return { ok: false, error: settingsError.message };

  return { ok: true, info };
}

async function checkProviderKey(provider: CredentialProvider, key: string): Promise<ValidateResult> {
  try {
    switch (provider) {
      case "openai": {
        const res = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${key}` },
        });
        if (res.status === 200) return { status: "connected", message: "Connected." };
        if (res.status === 401) return { status: "invalid", message: "Invalid API key." };
        if (res.status === 429) return { status: "quota_exceeded", message: "Key is valid but quota is exhausted." };
        return { status: "error", message: `Unexpected response (${res.status}).` };
      }
      case "gemini": {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`
        );
        if (res.status === 200) return { status: "connected", message: "Connected." };
        if (res.status === 400 || res.status === 403) return { status: "invalid", message: "Invalid API key." };
        return { status: "error", message: `Unexpected response (${res.status}).` };
      }
      case "elevenlabs": {
        const res = await fetch("https://api.elevenlabs.io/v1/user", {
          headers: { "xi-api-key": key },
        });
        if (res.status === 200) return { status: "connected", message: "Connected." };
        if (res.status === 401) return { status: "invalid", message: "Invalid API key." };
        return { status: "error", message: `Unexpected response (${res.status}).` };
      }
      case "fal": {
        if (key.includes(":")) {
          return { status: "connected", message: "Format looks valid — verified at first use." };
        }
        return { status: "invalid", message: "fal keys look like key_id:key_secret." };
      }
      default:
        return { status: "error", message: "Unsupported provider." };
    }
  } catch {
    return { status: "error", message: "Network error while validating — try again." };
  }
}

/**
 * Live-checks a credential with a FREE metadata call (no generation), then
 * on success stores it encrypted via the Vault-backed `store_credential`
 * RPC (service-role only) and records the outcome on
 * onboarding.api_status. The raw key is never returned to the caller.
 */
export async function validateCredentialAction(
  token: string,
  provider: CredentialProvider,
  key: string
): Promise<ValidateResult> {
  const onboarding = await loadOnboardingByToken(token);
  if (!onboarding) return { status: "error", message: "Invalid or expired onboarding link." };

  const lockError = assertEditable(onboarding.status);
  if (lockError) return { status: "error", message: lockError };

  const trimmedKey = key.trim();
  if (!trimmedKey) return { status: "invalid", message: "Enter a key first." };

  const result = await checkProviderKey(provider, trimmedKey);
  const admin = createAdminClient();

  if (result.status === "connected") {
    const { error: vaultError } = await admin.rpc("store_credential", {
      p_tenant: onboarding.tenant_id,
      p_provider: provider,
      p_secret: trimmedKey,
      p_meta: {},
    });
    if (vaultError) {
      return { status: "error", message: `Key is valid but couldn't be stored: ${vaultError.message}` };
    }
  }

  const nextApiStatus: ApiStatus = {
    ...onboarding.api_status,
    [provider]: { status: result.status, message: result.message, checkedAt: new Date().toISOString() },
  };
  await admin.from("onboarding").update({ api_status: nextApiStatus }).eq("id", onboarding.id);

  return result;
}

/** Locks the onboarding for review — requires the four required providers connected. */
export async function submitOnboardingAction(token: string): Promise<WizardActionResult> {
  const onboarding = await loadOnboardingByToken(token);
  if (!onboarding) return { ok: false, error: "Invalid or expired onboarding link." };

  const lockError = assertEditable(onboarding.status);
  if (lockError) return { ok: false, error: lockError };

  if (!onboarding.business_info?.business_name) {
    return { ok: false, error: "Business name is required before submitting." };
  }

  const missing = REQUIRED_PROVIDERS.filter(
    (p) => onboarding.api_status?.[p]?.status !== "connected"
  );
  if (missing.length > 0) {
    return { ok: false, error: `Connect all required APIs first: ${missing.join(", ")}.` };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("onboarding")
    .update({ status: "submitted", submitted_at: new Date().toISOString() })
    .eq("id", onboarding.id);
  if (error) return { ok: false, error: error.message };

  return { ok: true };
}

/** Polled by the waiting page every ~3s — cheap, token-gated status read. */
export async function getOnboardingStatusAction(token: string): Promise<OnboardingStatusResult | null> {
  const onboarding = await loadOnboardingByToken(token);
  if (!onboarding) return null;
  return { status: onboarding.status, notes: onboarding.notes };
}
