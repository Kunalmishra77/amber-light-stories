import { LifeBuoy, Mail } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { getPlatformSettings } from "@/lib/branding";

// Reads platform settings + env each request — never prerender.
export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const platform = await getPlatformSettings();
  // The owner's support inbox (the same address the platform sends mail from).
  const email = process.env.PLATFORM_EMAIL || process.env.SMTP_USER || "";

  return (
    <div>
      <PageHeader title="Support" description="Get help with your workspace." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-elevated p-5 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Mail className="h-5 w-5" strokeWidth={1.75} />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Email support</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Reach the {platform.platform_name} team for account, billing, or
              technical issues. We usually reply within one business day.
            </p>
          </div>
          {email ? (
            <a
              href={`mailto:${email}?subject=${encodeURIComponent(
                `${platform.platform_name} support`
              )}`}
              className="mt-auto inline-flex w-fit items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-on-primary transition-colors hover:bg-primary-hover"
            >
              <Mail className="h-3.5 w-3.5" strokeWidth={2} />
              {email}
            </a>
          ) : (
            <span className="mt-auto w-fit rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-muted-foreground">
              Support email not configured
            </span>
          )}
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-dashed border-border bg-surface/60 p-5">
          <LifeBuoy className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
          <p className="text-xs leading-relaxed text-muted-foreground">
            For an urgent production issue, use <strong>Emergency Stop</strong> on
            the Automation page to halt publishing while you sort it out — then
            email us the details.
          </p>
        </div>
      </div>
    </div>
  );
}
