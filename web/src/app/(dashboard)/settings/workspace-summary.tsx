import Link from "next/link";
import { ArrowRight, LayoutGrid } from "lucide-react";
import { SectionCard } from "./section-card";

export function WorkspaceSummary({
  displayName,
  tagline,
}: {
  displayName: string;
  tagline: string | null;
}) {
  return (
    <SectionCard
      id="workspace"
      icon={LayoutGrid}
      title="Workspace"
      description="Your brand identity across the dashboard, reports, and generated content."
    >
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium text-foreground">{displayName}</p>
          <p className="text-xs text-muted-foreground">{tagline || "No tagline set yet."}</p>
        </div>
        <Link
          href="/brand"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-elevated"
        >
          Edit full brand kit
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
        </Link>
      </div>
    </SectionCard>
  );
}
