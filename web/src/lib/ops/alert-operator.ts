import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Emails the people who run the platform when something breaks.
 *
 * Incidents were only ever written to `security_incidents` — nobody was told.
 * A dead render or a workspace failing every job sat there unnoticed until the
 * client complained, which is the worst way to find out. This closes that loop.
 *
 * Recipients are the super admins (the operators), resolved from `profiles`;
 * `PLATFORM_EMAIL` is the fallback so an alert still lands if no super admin
 * has an email on file. Best-effort by design: it never throws and never
 * blocks the operation that detected the problem — an alert failing must not
 * turn one problem into two.
 */
export async function alertOperator(subject: string, html: string): Promise<boolean> {
  try {
    const admin = createAdminClient();

    const { data } = await admin
      .from("profiles")
      .select("user_id")
      .eq("is_super_admin", true);

    const ids = (data ?? []).map((row: { user_id: string }) => row.user_id);

    let recipients: string[] = [];
    if (ids.length > 0) {
      const { getUserEmails } = await import("@/lib/admin/emails");
      recipients = [...(await getUserEmails(ids)).values()].filter(Boolean);
    }
    if (recipients.length === 0 && process.env.PLATFORM_EMAIL) {
      recipients = [process.env.PLATFORM_EMAIL];
    }
    if (recipients.length === 0) return false;

    const { sendMail } = await import("@/lib/email");
    // Sent one at a time so a single bad address can't suppress the rest.
    // Reported as delivered only if at least one actually went out — the
    // caller uses this to decide whether to mark the incident alerted.
    let delivered = false;
    for (const to of recipients) {
      if (await sendMail({ to, subject, html })) delivered = true;
    }
    return delivered;
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error(`[alert-operator] could not send alert: ${message}`);
    return false;
  }
}

interface UnalertedIncident {
  id: string;
  title: string;
  summary: string | null;
  severity: string;
  source: string | null;
  created_at: string;
}

/**
 * Emails one digest for the incidents nobody has been told about yet, then
 * stamps them. Driven from cron rather than from `raiseIncident` on purpose:
 * the Python render worker writes incidents straight to the table, so a
 * code-path hook in the web app would miss exactly the failures that matter
 * most — dead renders. A sweep catches every source.
 *
 * Only high/critical are emailed; anything quieter belongs on the operations
 * page, not in the operator's inbox. The stamp is written ONLY after the mail
 * is actually delivered, so a mail outage retries on the next sweep instead of
 * silently swallowing the alert.
 */
export async function sweepIncidentAlerts(limit = 20): Promise<number> {
  try {
    const admin = createAdminClient();

    const { data } = await admin
      .from("security_incidents")
      .select("id, title, summary, severity, source, created_at")
      .in("severity", ["high", "critical"])
      .is("alerted_at", null)
      .order("created_at", { ascending: true })
      .limit(limit);

    const rows = (data ?? []) as UnalertedIncident[];
    if (rows.length === 0) return 0;

    const { subject, html } = incidentDigestEmail(rows);
    const sent = await alertOperator(subject, html);
    if (!sent) return 0;

    await admin
      .from("security_incidents")
      .update({ alerted_at: new Date().toISOString() })
      .in(
        "id",
        rows.map((r) => r.id)
      );

    return rows.length;
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error(`[alert-operator] sweep failed: ${message}`);
    return 0;
  }
}

/** Renders one digest email for a batch of incidents. */
export function incidentDigestEmail(rows: UnalertedIncident[]): {
  subject: string;
  html: string;
} {
  const worst = rows.some((r) => r.severity === "critical") ? "CRITICAL" : "HIGH";
  const subject =
    rows.length === 1
      ? `[${worst}] ${rows[0].title}`
      : `[${worst}] ${rows.length} new incidents need attention`;

  const items = rows
    .map(
      (r) => `
      <li style="margin:0 0 12px">
        <strong style="color:#0f172a">${r.title}</strong>
        <span style="color:#64748b"> · ${r.severity}${r.source ? ` · ${r.source}` : ""}</span>
        ${r.summary ? `<div style="color:#334155;margin-top:2px">${r.summary}</div>` : ""}
      </li>`
    )
    .join("");

  return {
    subject,
    html: `
      <div style="font-family:system-ui,-apple-system,'Segoe UI',Arial,sans-serif;color:#0f172a">
        <h2 style="margin:0 0 12px">${rows.length === 1 ? "An incident needs attention" : `${rows.length} incidents need attention`}</h2>
        <ul style="padding-left:18px;margin:0">${items}</ul>
        <p style="margin:20px 0 0;font-size:13px;color:#64748b">
          Open the operations page in YT-Automation to acknowledge or resolve.
        </p>
      </div>
    `.trim(),
  };
}
