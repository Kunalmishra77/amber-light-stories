import type { LucideIcon } from "lucide-react";
import { Sparkles } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title?: string;
  description?: string;
}

export function EmptyState({
  icon: Icon = Sparkles,
  title = "Coming soon",
  description = "This section is coming in a later build phase.",
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
    </div>
  );
}
