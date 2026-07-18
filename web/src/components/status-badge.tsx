import { cn } from "@/lib/utils";

export type PipelineStatus =
  | "pending"
  | "running"
  | "awaiting_review"
  | "approved"
  | "done"
  | "failed"
  | "rejected"
  | "regenerating"
  | "skipped"
  | "paused"
  | "awaiting_payment";

const STATUS_CONFIG: Record<
  PipelineStatus,
  { label: string; color: string }
> = {
  pending: { label: "Pending", color: "var(--status-pending)" },
  running: { label: "Running", color: "var(--status-running)" },
  awaiting_review: {
    label: "Awaiting review",
    color: "var(--status-awaiting-review)",
  },
  approved: { label: "Approved", color: "var(--status-approved)" },
  done: { label: "Done", color: "var(--status-approved)" },
  failed: { label: "Failed", color: "var(--status-failed)" },
  rejected: { label: "Rejected", color: "var(--status-failed)" },
  regenerating: { label: "Regenerating", color: "var(--status-running)" },
  skipped: { label: "Skipped", color: "var(--status-pending)" },
  paused: { label: "Paused", color: "var(--status-paused)" },
  awaiting_payment: { label: "Paid gate", color: "var(--primary)" },
};

interface StatusBadgeProps {
  status: PipelineStatus | (string & {});
  className?: string;
}

/**
 * Dot + label pill for pipeline / job statuses. Falls back to a neutral
 * "pending" style for unrecognized status strings so it never throws on
 * loosely-typed data coming from the DB.
 */
export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config =
    STATUS_CONFIG[status as PipelineStatus] ??
    ({ label: status, color: "var(--status-pending)" } as const);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium",
        className
      )}
      style={{
        color: config.color,
        backgroundColor: `color-mix(in srgb, ${config.color} 14%, transparent)`,
        borderColor: `color-mix(in srgb, ${config.color} 30%, transparent)`,
      }}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: config.color }}
        aria-hidden="true"
      />
      {config.label}
    </span>
  );
}
