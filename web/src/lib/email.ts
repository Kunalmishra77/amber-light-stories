import "server-only";
import { google } from "googleapis";

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
}

function encodeBase64Url(input: string): string {
  return Buffer.from(input, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function buildRawMessage(opts: SendMailOptions & { from: string }): string {
  // Minimal RFC 822 message — HTML body only, UTF-8, no attachments.
  const lines = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: =?UTF-8?B?${Buffer.from(opts.subject, "utf-8").toString("base64")}?=`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
    "",
    opts.html,
  ];
  return encodeBase64Url(lines.join("\r\n"));
}

/**
 * Sends an email via the platform's Gmail account using OAuth2 (refresh
 * token) — the Gmail API's free tier, no paid service. BEST-EFFORT: every
 * failure (missing env, network, auth) is caught and logged; callers must
 * never let this block the action that triggered it (e.g. Create Client).
 */
export async function sendMail(options: SendMailOptions): Promise<boolean> {
  try {
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, PLATFORM_EMAIL } = process.env;

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN || !PLATFORM_EMAIL) {
      console.warn(`[email] Gmail credentials not configured — skipped send to ${options.to}`);
      return false;
    }

    const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
    oauth2Client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const raw = buildRawMessage({ ...options, from: PLATFORM_EMAIL });

    await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
    return true;
  } catch (err) {
    console.error(`[email] Failed to send mail to ${options.to}:`, err);
    return false;
  }
}

export interface CredentialEmailData {
  platformName: string;
  email: string;
  tempPassword: string;
  loginUrl: string;
}

/** Platform-branded "your account is ready" email — sent once, on Create
 * Client (onboarding approval). Best-effort, see sendMail. */
export async function sendCredentialEmail(to: string, data: CredentialEmailData): Promise<boolean> {
  const { platformName, email, tempPassword, loginUrl } = data;

  const html = `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#0a0a0c;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0c;padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background-color:#141417;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 8px 32px;text-align:center;">
                <div style="display:inline-flex;width:48px;height:48px;border-radius:12px;background-color:rgba(245,158,11,0.12);align-items:center;justify-content:center;font-size:22px;line-height:48px;">🎬</div>
                <h1 style="margin:16px 0 4px 0;color:#fafafa;font-size:18px;font-weight:600;">${platformName}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 0 32px;">
                <p style="margin:0 0 16px 0;color:#fafafa;font-size:16px;font-weight:600;">Your account is ready</p>
                <p style="margin:0 0 20px 0;color:#a1a1aa;font-size:14px;line-height:1.6;">
                  A super admin created your ${platformName} account. Use the credentials below to sign in — you'll
                  be asked to set your own password the first time you log in.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0c;border:1px solid rgba(255,255,255,0.08);border-radius:12px;">
                  <tr>
                    <td style="padding:16px 18px;">
                      <p style="margin:0 0 4px 0;color:#71717a;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;">Email</p>
                      <p style="margin:0 0 14px 0;color:#fafafa;font-size:14px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${email}</p>
                      <p style="margin:0 0 4px 0;color:#71717a;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;">Temporary password</p>
                      <p style="margin:0;color:#fafafa;font-size:14px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${tempPassword}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 8px 32px;text-align:center;">
                <a href="${loginUrl}" style="display:inline-block;background-color:#f59e0b;color:#1a1206;font-size:14px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:8px;">
                  Sign in to ${platformName}
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 32px 32px;text-align:center;">
                <p style="margin:0;color:#71717a;font-size:12px;line-height:1.6;">
                  For your security, this temporary password only works for your very first sign-in — you'll set a
                  new one immediately after. Didn't expect this email? You can ignore it.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim();

  return sendMail({ to, subject: `Your ${platformName} account is ready`, html });
}
