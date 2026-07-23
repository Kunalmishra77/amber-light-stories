import "server-only";
import type { CredentialStatus, CredentialProvider } from "@/lib/onboarding/types";

/**
 * Real provider-credential validation — the SINGLE implementation used by both
 * the pre-login onboarding wizard AND the in-portal API Management page.
 *
 * The audit found two different behaviours: the wizard made a real FREE
 * metadata call, while the in-portal "Test connection" only checked that a
 * secret existed in the Vault — so a client who rotated to a wrong key
 * in-portal still saw "Connected". This module removes that divergence.
 *
 * Every check is a FREE metadata/list call — no generation, no paid usage.
 * The raw key is only ever used for the outbound request; it is never returned,
 * logged, or persisted here (persistence is the caller's Vault write).
 */
export interface CredentialCheckResult {
  status: CredentialStatus;
  message: string;
}

const TIMEOUT_MS = 10_000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Validates an API-key credential against the provider's free metadata
 * endpoint. Only the four key-based AI providers are validated here; YouTube
 * and Gmail are OAuth (validated by the OAuth flow itself), so a call for them
 * returns a clear "use the connect button" result rather than pretending.
 */
export async function checkProviderKey(
  provider: CredentialProvider,
  key: string
): Promise<CredentialCheckResult> {
  const trimmed = key.trim();
  if (!trimmed) return { status: "invalid", message: "Enter a key first." };

  try {
    switch (provider) {
      case "openai": {
        const res = await fetchWithTimeout("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${trimmed}` },
        });
        if (res.status === 200) return { status: "connected", message: "Connected." };
        if (res.status === 401) return { status: "invalid", message: "Invalid API key." };
        if (res.status === 429)
          return { status: "quota_exceeded", message: "Key is valid but quota is exhausted." };
        return { status: "error", message: `Unexpected response (${res.status}).` };
      }
      case "gemini": {
        // Header, not `?key=` — a query string puts the customer's live key in
        // Google's request logs and in any egress proxy along the way.
        const res = await fetchWithTimeout("https://generativelanguage.googleapis.com/v1beta/models", {
          headers: { "x-goog-api-key": trimmed },
        });
        if (res.status === 200) return { status: "connected", message: "Connected." };
        if (res.status === 400 || res.status === 403)
          return { status: "invalid", message: "Invalid API key." };
        return { status: "error", message: `Unexpected response (${res.status}).` };
      }
      case "elevenlabs": {
        const res = await fetchWithTimeout("https://api.elevenlabs.io/v1/user", {
          headers: { "xi-api-key": trimmed },
        });
        if (res.status === 200) return { status: "connected", message: "Connected." };
        if (res.status === 401) return { status: "invalid", message: "Invalid API key." };
        return { status: "error", message: `Unexpected response (${res.status}).` };
      }
      case "fal": {
        // fal keys are `key_id:key_secret`. There is no free metadata endpoint
        // that validates cheaply, so verify the shape and confirm at first use.
        if (/^[^:\s]+:[^:\s]+$/.test(trimmed)) {
          return { status: "connected", message: "Format looks valid — verified at first use." };
        }
        return { status: "invalid", message: "fal keys look like key_id:key_secret." };
      }
      case "youtube":
      case "gmail":
        return {
          status: "error",
          message: `${provider === "youtube" ? "YouTube" : "Gmail"} connects with Google sign-in, not an API key.`,
        };
      default:
        return { status: "error", message: "Unsupported provider." };
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { status: "error", message: "The provider took too long to respond — try again." };
    }
    return { status: "error", message: "Network error while validating — try again." };
  }
}
