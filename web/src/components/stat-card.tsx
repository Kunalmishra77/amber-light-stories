import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  error?: boolean;
}

export function StatCard({ label, value, icon: Icon, error }: StatCardProps) {
  return (
    <div
      className={cn(
        "group flex flex-col gap-4 rounded-xl border border-border bg-elevated p-5 shadow-sm transition-[transform,box-shadow] duration-200 ease-out",
        "hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/30"
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">
          {label}
        </span>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors duration-200 ease-out group-hover:bg-primary/15">
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </div>
      </div>
      <span
        className={cn(
          "font-sans text-3xl font-semibold tabular-nums tracking-tight text-foreground",
          error && "text-muted-foreground"
        )}
      >
        {error ? "—" : value}
      </span>
    </div>
  );
}
