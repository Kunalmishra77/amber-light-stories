import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentTenantId, getSessionUser, requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/ops/audit";
import { notifyTenantOwners } from "@/lib/ops/notify";
import { getAppOrigin } from "@/lib/site-url";
import {
  YOUTUBE_OAUTH_COOKIE,
  decodeState,
  exchangeCodeForChannel,
  persistConnection,
  YouTubeAuthError,
} from "@/lib/providers/youtube-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * OAuth callback. Every failure path redirects with a short reason code — the
 * authorization code, the tokens and any provider error detail never reach the
 * browser, the URL or the logs.
 */
export async function GET(request: Request) {
  const origin = await getAppOrigin();
  const done = (params: string) => {
    const response = NextResponse.redirect(`${origin}/youtube?${params}`);
    // The nonce is single-use whatever the outcome.
    response.cookies.delete(YOUTUBE_OAUTH_COOKIE);
    return response;
  };

  const url = new URL(request.url);
  const denied = url.searchParams.get("error");
  if (denied) {
    // e.g. access_denied when the customer cancels on Google's screen.
    return done("connect=denied");
  }

  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const nonce = (await cookies()).get(YOUTUBE_OAUTH_COOKIE)?.value ?? null;

  const state = decodeState(stateParam, nonce);
  if (!code || !state) {
    return done("connect=invalid-state");
  }

  // Re-verify the session independently of the state: a signed state proves the
  // flow started here, not that the person finishing it is still the same
  // authorized user.
  const user = await getSessionUser();
  const tenantId = await getCurrentTenantId();
  if (!user || !tenantId) return done("connect=signed-out");
  if (tenantId !== state.tenantId || user.id !== state.userId) {
    return done("connect=context-changed");
  }
  if (!(await requirePermission("channels.manage", tenantId))) {
    return done("connect=forbidden");
  }

  try {
    const channel = await exchangeCodeForChannel(code);
    const { channelId } = await persistConnection({
      tenantId,
      channel,
      connectedBy: user.id,
    });

    await logAudit({
      action: "youtube.connected",
      target: `channel:${channelId}`,
      // Ids and titles only — never the token or the scope grant payload.
      meta: { external_channel_id: channel.externalChannelId, title: channel.title },
      tenantId,
    });
    await notifyTenantOwners(tenantId, {
      kind: "channel_connected",
      category: "publishing",
      title: "YouTube channel connected",
      body: `${channel.title ?? "A channel"} is now connected and can receive publications.`,
      link: "/youtube",
      dedupeKey: `youtube-connected:${channel.externalChannelId}`,
    });

    return done("connect=success");
  } catch (err) {
    if (err instanceof YouTubeAuthError) {
      console.error("[youtube-oauth] connection failed:", err.message);
      return done(`connect=auth-failed&detail=${encodeURIComponent(err.message.slice(0, 160))}`);
    }
    console.error(
      "[youtube-oauth] connection failed:",
      err instanceof Error ? err.message : "unknown error"
    );
    return done("connect=failed");
  }
}
