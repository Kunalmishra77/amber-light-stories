import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Paths reachable while signed out. Everything else falls through to the
 * auth gate below and gets bounced to /login.
 *
 * /onboarding is the token-gated client wizard (S3) — it has no Supabase
 * session by design; the link_token itself is the credential, checked
 * server-side in src/lib/onboarding/token.ts on every read/write.
 *
 * /forgot-password and /reset-password are the self-service password-reset
 * flow (P6.2) — both must be reachable without an existing session.
 */
// `/api/cron` runs the scheduler (M5); it has no user session and enforces
// its own `CRON_SECRET` auth. `/api/v1` is the public API (M8/P2-12); it
// authenticates by API key, not a session, so it also bypasses the login gate.
const PUBLIC_PATHS = [
  "/login",
  "/onboarding",
  "/forgot-password",
  "/reset-password",
  "/welcome",
  "/privacy",
  "/terms",
  "/api/cron",
  "/api/v1",
];

/** The only route a signed-in must_change_password user may reach. */
const FORCE_CHANGE_PATH = "/change-password";

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

/**
 * Refreshes the Supabase auth session cookie on every request and enforces
 * the auth gate: signed-out users are redirected to /login (except on
 * public paths), and signed-in users are bounced off /login to the app.
 *
 * Must be called from middleware — this is the only place session cookies
 * can be refreshed and written back to both the request and the response.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  // IMPORTANT: do not add logic between createServerClient and getUser().
  // Skipping this call can desync the session cookie, randomly logging
  // users out.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user) {
    // A signed-out visitor on the domain root gets the public marketing page,
    // not a login form. /welcome is the product's public homepage — it is also
    // the "application home page" Google's OAuth verification points at, so it
    // must stay reachable without a session.
    if (pathname === "/") {
      const url = request.nextUrl.clone();
      url.pathname = "/welcome";
      url.search = "";
      return NextResponse.redirect(url);
    }
    if (!isPublicPath(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // Signed in from here on. Forced password change wins over every other
  // routing rule (including the /login bounce below) — a user who hasn't
  // changed their temp password yet must not be able to reach anything
  // else in the app.
  if (pathname !== FORCE_CHANGE_PATH) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("must_change_password")
      .eq("user_id", user.id)
      .maybeSingle<{ must_change_password: boolean | null }>();

    if (profile?.must_change_password) {
      const url = request.nextUrl.clone();
      url.pathname = FORCE_CHANGE_PATH;
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  if (pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // IMPORTANT: return supabaseResponse as-is (not a new NextResponse) so the
  // refreshed cookies actually reach the browser.
  return supabaseResponse;
}
