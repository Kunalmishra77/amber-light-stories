import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { google } from "googleapis";
import { createAdminClient } from "@/lib/supabase/admin";
import { OAuthNotConfiguredError, YouTubeAuthError } from "@/lib/publishing/errors";
import {
  YOUTUBE_SCOPES,
  getOAuthConfig,
  getRedirectUri,
} from "@/lib/providers/youtube-config";

/**
 * YouTube OAuth (Priority 1).
 *
 * Reuses the existing seams rather than adding a parallel credential system:
 *   - the REFRESH TOKEN is the tenant credential, stored through the M3 Vault
 *     seam (`store_credential`) — never in a plain column, never in a log;
 *   - the connected channel is a `channels` row (M3 publishing target), so
 *     `getPublishingTarget()` keeps working unchanged;
 *   - access tokens are minted on demand and never persisted.
 *
 * CSRF: the `state` parameter is an HMAC-signed, expiring, tenant-bound value
 * whose nonce must also match an httpOnly cookie set at the start of the flow
 * (double-submit). A state that is replayed, tampered with, issued for another
 * tenant, or older than the TTL is rejected.
 */
// Config + CSRF state live in youtube-config (no googleapis), so callers that
// only need "is this configured?" don't load the API client.
export {
  YOUTUBE_OAUTH_COOKIE,
  getOAuthConfig,
  isOAuthConfigured,
  getRedirectUri,
  encodeState,
  decodeState,
  type OAuthState,
} from "@/lib/providers/youtube-config";
export { OAuthNotConfiguredError, YouTubeAuthError };

async function oauthClient() {
  const config = getOAuthConfig();
  if (!config) throw new OAuthNotConfiguredError();
  return new google.auth.OAuth2(config.clientId, config.clientSecret, await getRedirectUri());
}

/** The Google consent URL. `prompt=consent` guarantees a refresh token. */
export async function buildAuthUrl(state: string): Promise<string> {
  const client = await oauthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: YOUTUBE_SCOPES,
    state,
  });
}

export interface ConnectedChannel {
  externalChannelId: string;
  title: string | null;
  refreshToken: string;
  scope: string | null;
}

/**
 * Exchanges the authorization code and reads back the channel being connected.
 * Throws rather than returning a partial result — a connection without a
 * refresh token would silently stop working the moment the access token expired.
 */
export async function exchangeCodeForChannel(code: string): Promise<ConnectedChannel> {
  const client = await oauthClient();

  let tokens;
  try {
    ({ tokens } = await client.getToken(code));
  } catch (err) {
    throw new YouTubeAuthError(
      `Google rejected the authorization: ${err instanceof Error ? err.message : "unknown error"}`
    );
  }
  if (!tokens.refresh_token) {
    throw new YouTubeAuthError(
      "Google didn't return a refresh token. Remove this app at myaccount.google.com/permissions and connect again."
    );
  }
  client.setCredentials(tokens);

  const youtube = google.youtube({ version: "v3", auth: client });
  const { data } = await youtube.channels.list({ part: ["id", "snippet"], mine: true });
  const channel = data.items?.[0];
  if (!channel?.id) {
    throw new YouTubeAuthError(
      "That Google account has no YouTube channel. Create one, then connect again."
    );
  }

  return {
    externalChannelId: channel.id,
    title: channel.snippet?.title ?? null,
    refreshToken: tokens.refresh_token,
    scope: tokens.scope ?? null,
  };
}

/**
 * Persists a connection: refresh token to the Vault, channel to `channels`.
 * Service-role by necessity (the Vault RPCs are revoked from `authenticated`);
 * the CALLER must already have authorized the request for this tenant.
 */
export async function persistConnection(input: {
  tenantId: string;
  channel: ConnectedChannel;
  connectedBy: string | null;
}): Promise<{ channelId: string }> {
  const admin = createAdminClient();

  const { error: vaultError } = await admin.rpc("store_credential", {
    p_tenant: input.tenantId,
    p_provider: "youtube",
    p_secret: input.channel.refreshToken,
    p_meta: {
      external_channel_id: input.channel.externalChannelId,
      channel_title: input.channel.title,
      scope: input.channel.scope,
      connected_by: input.connectedBy,
      connected_at: new Date().toISOString(),
    },
  });
  if (vaultError) {
    // Never echo the DB message: this path handled the refresh token.
    console.error("[youtube-oauth] store_credential failed:", vaultError.code ?? "unknown");
    throw new Error("Couldn't store the connection securely. Please try again.");
  }

  // One channel row per (tenant, external channel) — reconnecting updates it
  // rather than accumulating duplicates that getPublishingTarget would shuffle.
  const { data: existing } = await admin
    .from("channels")
    .select("id")
    .eq("tenant_id", input.tenantId)
    .eq("provider", "youtube")
    .eq("external_channel_id", input.channel.externalChannelId)
    .maybeSingle<{ id: string }>();

  if (existing) {
    await admin
      .from("channels")
      .update({
        title: input.channel.title,
        name: input.channel.title,
        status: "connected",
        yt_channel_id: input.channel.externalChannelId,
      })
      .eq("id", existing.id);
    return { channelId: existing.id };
  }

  const { data: created, error } = await admin
    .from("channels")
    .insert({
      tenant_id: input.tenantId,
      provider: "youtube",
      external_channel_id: input.channel.externalChannelId,
      yt_channel_id: input.channel.externalChannelId,
      title: input.channel.title,
      name: input.channel.title,
      status: "connected",
    })
    .select("id")
    .single();
  if (error || !created) throw new Error("Couldn't record the connected channel.");
  return { channelId: created.id as string };
}

/**
 * An authorized Google client for a tenant, built from the stored refresh
 * token. googleapis refreshes the access token itself, so nothing short-lived
 * is ever persisted. Throws YouTubeAuthError when the tenant must reconnect.
 */
export async function getAuthorizedClient(tenantId: string) {
  const config = getOAuthConfig();
  if (!config) throw new OAuthNotConfiguredError();

  const { getTenantCredential } = await import("@/lib/providers/tenant-providers");
  const refreshToken = await getTenantCredential(tenantId, "youtube");
  if (!refreshToken) {
    throw new YouTubeAuthError("This workspace hasn't connected a YouTube channel yet.");
  }

  const client = new google.auth.OAuth2(config.clientId, config.clientSecret, await getRedirectUri());
  client.setCredentials({ refresh_token: refreshToken });

  try {
    // Forces a refresh now, so an expired/revoked grant surfaces here as a
    // clear reconnect prompt instead of mid-upload.
    await client.getAccessToken();
  } catch (err) {
    await markCredentialRevoked(tenantId);
    throw new YouTubeAuthError(
      `YouTube access needs to be reconnected: ${err instanceof Error ? err.message : "authorization failed"}`
    );
  }
  return client;
}

/**
 * A fresh YouTube ACCESS token for a tenant.
 *
 * The Vault stores the tenant's REFRESH token; the YouTube Analytics API needs
 * an access token. This exchanges one for the other (googleapis caches and
 * refreshes it). Callers that pass a credential straight to a `Bearer` header —
 * e.g. analytics ingestion — must use THIS, not the raw stored credential,
 * which would be a refresh token and always 401.
 */
export async function getYouTubeAccessToken(tenantId: string): Promise<string> {
  const client = await getAuthorizedClient(tenantId);
  const { token } = await client.getAccessToken();
  if (!token) {
    const { YouTubeAuthError } = await import("@/lib/publishing/errors");
    throw new YouTubeAuthError("Couldn't obtain a YouTube access token — reconnect the channel.");
  }
  return token;
}

/** Flags the credential so the UI can prompt a reconnect. Best-effort. */
export async function markCredentialRevoked(tenantId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin
      .from("tenant_credentials")
      .update({ status: "revoked", health: "unhealthy", last_checked_at: new Date().toISOString() })
      .eq("tenant_id", tenantId)
      .eq("provider", "youtube");
    await admin
      .from("channels")
      .update({ status: "disconnected" })
      .eq("tenant_id", tenantId)
      .eq("provider", "youtube");
  } catch {
    // Best-effort: never mask the original auth failure.
  }
}

/** Disconnects: revokes the grant at Google, then clears local state. */
export async function disconnectChannel(tenantId: string): Promise<void> {
  const { getTenantCredential } = await import("@/lib/providers/tenant-providers");
  const refreshToken = await getTenantCredential(tenantId, "youtube");

  if (refreshToken) {
    try {
      const client = await oauthClient();
      await client.revokeToken(refreshToken);
    } catch {
      // Google may already consider it revoked — proceed with local cleanup.
    }
  }

  const admin = createAdminClient();
  await admin
    .from("tenant_credentials")
    .update({ status: "disconnected", health: "unknown", last_checked_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("provider", "youtube");
  await admin
    .from("channels")
    .update({ status: "disconnected" })
    .eq("tenant_id", tenantId)
    .eq("provider", "youtube");
}
