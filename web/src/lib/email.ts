import "server-only";
import { google } from "googleapis";
import { credentialEmail, type CredentialEmailData } from "@/lib/email/templates";

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

export type { CredentialEmailData };

/** Platform-branded "your account is ready" email — sent once, on Create
 * Client (onboarding approval). Best-effort, see sendMail. Renders via the
 * centralized templates module (src/lib/email/templates.ts). */
export async function sendCredentialEmail(to: string, data: CredentialEmailData): Promise<boolean> {
  const { subject, html } = credentialEmail(data);
  return sendMail({ to, subject, html });
}
