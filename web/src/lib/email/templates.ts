import "server-only";

/**
 * Centralized platform-branded HTML email templates. Every template returns
 * a plain `{ subject, html }` pair — no side effects, no network calls — so
 * they're trivial to unit-test and safe to import from any server context.
 * Actual delivery goes through `sendMail` in src/lib/email.ts (Gmail API,
 * best-effort, never blocks the caller).
 *
 * Visual language matches the rest of the OLED-dark + amber design system:
 * dark card on a dark background, amber CTA button, muted footer copy.
 */

export interface EmailAction {
  label: string;
  url: string;
}

interface ShellOptions {
  platformName: string;
  /** Small emoji/icon glyph shown in the header badge. */
  glyph?: string;
  eyebrow?: string;
  heading: string;
  /** Body paragraphs — each rendered as its own <p>. */
  paragraphs: string[];
  /** Optional key/value pairs rendered in a bordered detail box (e.g.
   * credentials, item title, error message). */
  details?: { label: string; value: string; mono?: boolean }[];
  action?: EmailAction;
  footerNote?: string;
}

/** Shared header/body/footer shell every template below renders through —
 * this is the one place the platform's email "chrome" lives. */
function emailShell(opts: ShellOptions): string {
  const {
    platformName,
    glyph = "🎬",
    eyebrow,
    heading,
    paragraphs,
    details,
    action,
    footerNote,
  } = opts;

  const paragraphsHtml = paragraphs
    .map(
      (p, i) => `
                <p style="margin:0 0 ${i === paragraphs.length - 1 && !details && !action ? "0" : "16"}px 0;color:#a1a1aa;font-size:14px;line-height:1.6;">
                  ${p}
                </p>`
    )
    .join("");

  const detailsHtml = details?.length
    ? `
            <tr>
              <td style="padding:0 32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0c;border:1px solid rgba(255,255,255,0.08);border-radius:12px;">
                  <tr>
                    <td style="padding:16px 18px;">
                      ${details
                        .map(
                          (d, i) => `
                      <p style="margin:${i === 0 ? "0" : "14px"} 0 4px 0;color:#71717a;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;">${d.label}</p>
                      <p style="margin:0;color:#fafafa;font-size:14px;${d.mono ? "font-family:ui-monospace,SFMono-Regular,Menlo,monospace;" : ""}">${d.value}</p>`
                        )
                        .join("")}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>`
    : "";

  const actionHtml = action
    ? `
            <tr>
              <td style="padding:24px 32px 8px 32px;text-align:center;">
                <a href="${action.url}" style="display:inline-block;background-color:#f59e0b;color:#1a1206;font-size:14px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:8px;">
                  ${action.label}
                </a>
              </td>
            </tr>`
    : "";

  const eyebrowHtml = eyebrow
    ? `<p style="margin:0 0 6px 0;color:#f59e0b;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">${eyebrow}</p>`
    : "";

  return `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#0a0a0c;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0c;padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background-color:#141417;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 8px 32px;text-align:center;">
                <div style="display:inline-flex;width:48px;height:48px;border-radius:12px;background-color:rgba(245,158,11,0.12);align-items:center;justify-content:center;font-size:22px;line-height:48px;">${glyph}</div>
                <h1 style="margin:16px 0 4px 0;color:#fafafa;font-size:18px;font-weight:600;">${platformName}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 0 32px;">
                ${eyebrowHtml}
                <p style="margin:0 0 16px 0;color:#fafafa;font-size:16px;font-weight:600;">${heading}</p>
                ${paragraphsHtml}
              </td>
            </tr>
            ${detailsHtml}
            ${actionHtml}
            <tr>
              <td style="padding:16px 32px 32px 32px;text-align:center;">
                <p style="margin:0;color:#71717a;font-size:12px;line-height:1.6;">
                  ${footerNote ?? "This is an automated notification — you can safely ignore it if it doesn't apply to you."}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim();
}

export interface EmailTemplate {
  subject: string;
  html: string;
}

export interface CredentialEmailData {
  platformName: string;
  email: string;
  tempPassword: string;
  loginUrl: string;
}

/** "Your account is ready" — sent once, on Create Client (onboarding
 * approval). */
export function credentialEmail(data: CredentialEmailData): EmailTemplate {
  const { platformName, email, tempPassword, loginUrl } = data;
  return {
    subject: `Your ${platformName} account is ready`,
    html: emailShell({
      platformName,
      heading: "Your account is ready",
      paragraphs: [
        `A super admin created your ${platformName} account. Use the credentials below to sign in — you'll be asked to set your own password the first time you log in.`,
      ],
      details: [
        { label: "Email", value: email, mono: true },
        { label: "Temporary password", value: tempPassword, mono: true },
      ],
      action: { label: `Sign in to ${platformName}`, url: loginUrl },
      footerNote:
        "For your security, this temporary password only works for your very first sign-in — you'll set a new one immediately after. Didn't expect this email? You can ignore it.",
    }),
  };
}

export interface ApprovalEmailData {
  platformName: string;
  itemTitle: string;
  itemType?: string;
  reviewUrl: string;
}

/** Sent when a piece of content (story, plan item, pipeline stage) is
 * approved. */
export function approvalEmail(data: ApprovalEmailData): EmailTemplate {
  const { platformName, itemTitle, itemType = "item", reviewUrl } = data;
  return {
    subject: `Approved: ${itemTitle}`,
    html: emailShell({
      platformName,
      glyph: "✅",
      eyebrow: "Approved",
      heading: `"${itemTitle}" was approved`,
      paragraphs: [`This ${itemType} passed review and will continue through the pipeline automatically.`],
      action: { label: "View in dashboard", url: reviewUrl },
    }),
  };
}

export interface RejectionEmailData {
  platformName: string;
  itemTitle: string;
  itemType?: string;
  reason?: string | null;
  reviewUrl: string;
}

/** Sent when a piece of content is rejected and needs attention. */
export function rejectionEmail(data: RejectionEmailData): EmailTemplate {
  const { platformName, itemTitle, itemType = "item", reason, reviewUrl } = data;
  return {
    subject: `Rejected: ${itemTitle}`,
    html: emailShell({
      platformName,
      glyph: "⚠️",
      eyebrow: "Needs attention",
      heading: `"${itemTitle}" was rejected`,
      paragraphs: [`This ${itemType} did not pass review and needs a look before it can continue.`],
      details: reason ? [{ label: "Reason", value: reason }] : undefined,
      action: { label: "Review now", url: reviewUrl },
    }),
  };
}

export interface VideoPublishedEmailData {
  platformName: string;
  videoTitle: string;
  videoUrl: string;
  channelName?: string;
}

/** Sent when a video finishes publishing to YouTube. */
export function videoPublishedEmail(data: VideoPublishedEmailData): EmailTemplate {
  const { platformName, videoTitle, videoUrl, channelName } = data;
  return {
    subject: `Published: ${videoTitle}`,
    html: emailShell({
      platformName,
      glyph: "🚀",
      eyebrow: "Published",
      heading: `"${videoTitle}" is live`,
      paragraphs: [
        channelName
          ? `Your video just went live on ${channelName}.`
          : "Your video just went live.",
      ],
      action: { label: "Watch on YouTube", url: videoUrl },
    }),
  };
}

export interface JobFailedEmailData {
  platformName: string;
  jobName: string;
  errorMessage?: string | null;
  retryUrl: string;
}

/** Sent when a pipeline stage or render job fails and needs manual retry. */
export function jobFailedEmail(data: JobFailedEmailData): EmailTemplate {
  const { platformName, jobName, errorMessage, retryUrl } = data;
  return {
    subject: `Failed: ${jobName}`,
    html: emailShell({
      platformName,
      glyph: "🛑",
      eyebrow: "Job failed",
      heading: `"${jobName}" failed`,
      paragraphs: ["This job stopped and needs a retry or a closer look."],
      details: errorMessage ? [{ label: "Error", value: errorMessage }] : undefined,
      action: { label: "View details", url: retryUrl },
    }),
  };
}
