import type { LucideIcon } from "lucide-react";
import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";

interface EmptyStateAction {
  label: string;
  href: string;
}

interface EmptyStateProps {
  icon?: LucideIcon;
  title?: string;
  description?: string;
  /** Optional next-action CTA — a link to wherever the user should go to
   * populate this section (e.g. "Generate a video" -> /generate). Keeps
   * empty states for a brand-new tenant coaching rather than just blank. */
  action?: EmptyStateAction;
}

export function EmptyState({
  icon: Icon = Sparkles,
  title = "Coming soon",
  description = "This section is coming in a later build phase.",
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-surface/60 px-6 py-24 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-elevated text-muted-foreground">
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
      {action ? (
        <Link
          href={action.href}
          className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-on-primary transition-colors hover:bg-primary-hover"
        >
          {action.label}
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
        </Link>
      ) : null}
    </div>
  );
}
