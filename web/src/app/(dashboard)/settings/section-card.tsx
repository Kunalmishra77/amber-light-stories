import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface SectionCardProps {
  id: string;
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}

/** Consistent anchored card shell for every Settings section. `scroll-mt-24`
 * keeps the section clear of the sticky topbar when jumped to from the
 * sub-nav. */
export function SectionCard({ id, icon: Icon, title, description, action, children }: SectionCardProps) {
  return (
    <section id={id} className="scroll-mt-24 rounded-xl border border-border bg-elevated shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
          </div>
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}
