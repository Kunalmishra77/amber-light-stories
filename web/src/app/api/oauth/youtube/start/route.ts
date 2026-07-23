import { NextResponse } from "next/server";
import { getCurrentTenantId, getSessionUser, requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/ops/audit";
import { buildAuthUrl } from "@/lib/providers/youtube-oauth";
import {
  YOUTUBE_OAUTH_COOKIE,
  encodeState,
  isOAuthConfigured,
} from "@/lib/providers/youtube-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Begins the YouTube connection. Authenticated + permission-gated: connecting a
 * channel decides where this workspace's videos are published, so it requires
 * `channels.manage`, not merely membership.
 *
 * The CSRF nonce is set as an httpOnly cookie and embedded in the signed state;
 * the callback requires both to match.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"));
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) {
    return NextResponse.redirect(await errorUrl("no-workspace"));
  }
  if (!(await requirePermission("channels.manage", tenantId))) {
    return NextResponse.redirect(await errorUrl("forbidden"));
  }
  if (!isOAuthConfigured()) {
    return NextResponse.redirect(await errorUrl("not-configured"));
  }

  const { state, nonce } = encodeState({ tenantId, userId: user.id });

  await logAudit({
    action: "youtube.oauth_start",
    target: `tenant:${tenantId}`,
    meta: {},
    tenantId,
  });

  const response = NextResponse.redirect(await buildAuthUrl(state));
  response.cookies.set(YOUTUBE_OAUTH_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // must survive the top-level redirect back from Google
    path: "/api/oauth/youtube",
    maxAge: 600,
  });
  return response;
}

async function errorUrl(reason: string): Promise<string> {
  const { getAppOrigin } = await import("@/lib/site-url");
  return `${await getAppOrigin()}/youtube?connect=${reason}`;
}
