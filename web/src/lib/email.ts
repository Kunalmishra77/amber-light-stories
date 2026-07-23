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
 * Sends an email from the platform Gmail account. BEST-EFFORT: every failure
 * (missing env, network, auth) is caught and logged; callers must never let
 * this block the action that triggered it (e.g. Create Client).
 *
 * Preferred transport is Gmail SMTP with an **App Password** (`SMTP_USER` +
 * `SMTP_PASS`): simplest to operate for a solo owner and, unlike an OAuth
 * refresh token in a "testing" project (which expires every 7 days), an App
 * Password never expires. Falls back to the Gmail API (OAuth refresh token)
 * when SMTP isn't configured, so any existing setup keeps working unchanged.
 */
export async function sendMail(options: SendMailOptions): Promise<boolean> {
  const { SMTP_USER, SMTP_PASS, PLATFORM_EMAIL } = process.env;
  const from = PLATFORM_EMAIL || SMTP_USER || "";

  if (SMTP_USER && SMTP_PASS) {
    try {
      const nodemailer = (await import("nodemailer")).default;
      const transport = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
      });
      // Gmail rewrites From to the authenticated account, so `from` is honoured
      // only when it matches SMTP_USER — which it will for a single-Gmail sender.
      await transport.sendMail({
        from: from || SMTP_USER,
        to: options.to,
        subject: options.subject,
        html: options.html,
      });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      console.error(`[email] SMTP send failed to ${options.to}: ${message}`);
      return false;
    }
  }

  return sendViaGmailApi(options);
}

/** Legacy transport: Gmail API via an OAuth2 refresh token. Retained as a
 * fallback for setups that haven't switched to an App Password. */
async function sendViaGmailApi(options: SendMailOptions): Promise<boolean> {
  try {
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, PLATFORM_EMAIL } = process.env;

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN || !PLATFORM_EMAIL) {
      console.warn(`[email] No email transport configured (SMTP or Gmail API) — skipped send to ${options.to}`);
      return false;
    }

    const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
    oauth2Client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const raw = buildRawMessage({ ...options, from: PLATFORM_EMAIL });

    await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
    return true;
  } catch (err) {
    // Log the message ONLY. A Gaxios error carries `config.body` — the base64
    // RFC-822 message — and its redactor does not mask it, so logging the whole
    // error would print the credential email's temporary password (and the
    // refresh token) into the server log.
    const message = err instanceof Error ? err.message : "unknown error";
    console.error(`[email] Failed to send mail to ${options.to}: ${message}`);
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
