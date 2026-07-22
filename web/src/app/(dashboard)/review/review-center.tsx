"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ShieldAlert, Timer, UserPlus } from "lucide-react";
import type { ReviewItemEnriched, ReviewFilter } from "@/lib/review/queue";
import { assignReview, bulkApprove, bulkReject } from "./actions";
import { cn } from "@/lib/utils";

interface Reviewer {
  id: string;
  name: string;
}

const FILTER_LABELS: Record<ReviewFilter, string> = {
  all: "All",
  mine: "Assigned to me",
  unassigned: "Unassigned",
  overdue: "Past due",
};

function stageTitle(item: ReviewItemEnriched): string {
  const output = item.output as { title?: string } | null;
  return output?.title ?? item.stage.replace(/_/g, " ");
}

/** A one-glance reason the item is risky, or null when it is clean. */
function riskLabel(item: ReviewItemEnriched): { text: string; tone: "block" | "warn" } | null {
  if (item.complianceStatus === "blocked")
    return { text: "Compliance blocked — must be fixed, cannot be approved", tone: "block" };
  if (item.qualityAction === "block") return { text: "Quality gate failed", tone: "block" };
  if (item.complianceStatus === "manual_review")
    return { text: "Compliance findings need a look", tone: "warn" };
  if (item.qualityAction === "manual_review") return { text: "Quality needs a look", tone: "warn" };
  return null;
}

export function ReviewCenter({
  items,
  reviewers,
  currentUserId,
  filter,
}: {
  items: ReviewItemEnriched[];
  reviewers: Reviewer[];
  currentUserId: string | null;
  filter: ReviewFilter;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function runBulk(kind: "approve" | "reject") {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const reason =
      kind === "reject"
        ? window.prompt("Why are these being rejected?")?.trim() || "Rejected from the Review Center."
        : "";

    startTransition(async () => {
      const result =
        kind === "approve" ? await bulkApprove(ids) : await bulkReject(ids, reason);
      setSelected(new Set());
      setMessage(
        result.failed.length === 0
          ? `${result.approved} item${result.approved === 1 ? "" : "s"} ${kind === "approve" ? "approved" : "rejected"}.`
          : `${result.approved} succeeded, ${result.failed.length} refused: ${result.failed[0].error}`
      );
      router.refresh();
    });
  }

  function claim(id: string, assignee: string | null) {
    startTransition(async () => {
      const r = await assignReview(id, assignee);
      if (!r.ok) setMessage(r.error ?? "Couldn't assign that item.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(FILTER_LABELS) as ReviewFilter[]).map((f) => (
          <Link
            key={f}
            href={`/review?filter=${f}`}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
              filter === f
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-elevated text-muted-foreground hover:text-foreground"
            )}
          >
            {FILTER_LABELS[f]}
          </Link>
        ))}
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-elevated p-3">
          <span className="text-xs font-medium text-foreground">{selected.size} selected</span>
          <button
            type="button"
            disabled={pending}
            onClick={() => runBulk("approve")}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            Approve selected
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => runBulk("reject")}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-surface disabled:opacity-50"
          >
            Reject selected
          </button>
          <span className="text-xs text-muted-foreground">
            Each item still passes its own safety checks — bulk never skips them.
          </span>
        </div>
      )}

      {message && (
        <p className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted-foreground">
          {message}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {items.map((item) => {
          const risk = riskLabel(item);
          return (
            <li
              key={item.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-elevated p-4 sm:flex-row sm:items-center"
            >
              <input
                type="checkbox"
                aria-label={`Select ${stageTitle(item)}`}
                checked={selected.has(item.id)}
                onChange={() => toggle(item.id)}
                className="h-4 w-4 shrink-0 accent-[var(--primary)]"
              />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/review/${item.id}`}
                    className="truncate text-sm font-medium text-foreground hover:text-primary"
                  >
                    {stageTitle(item)}
                  </Link>
                  {item.overdue && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-status-running/10 px-1.5 py-0.5 text-[11px] font-medium text-status-running">
                      <Timer className="h-3 w-3" strokeWidth={2} />
                      past due
                    </span>
                  )}
                  {risk && (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                        risk.tone === "block"
                          ? "bg-status-failed/10 text-status-failed"
                          : "bg-status-running/10 text-status-running"
                      )}
                    >
                      {risk.tone === "block" ? (
                        <ShieldAlert className="h-3 w-3" strokeWidth={2} />
                      ) : (
                        <AlertTriangle className="h-3 w-3" strokeWidth={2} />
                      )}
                      {risk.text}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {item.topic ?? "Untitled story"} · waiting {item.waitingHours < 1
                    ? "<1h"
                    : `${Math.round(item.waitingHours)}h`}
                  {item.assigneeName ? ` · ${item.assigneeName}` : " · unassigned"}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {item.assigned_to !== currentUserId && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => claim(item.id, currentUserId)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                  >
                    <UserPlus className="h-3.5 w-3.5" strokeWidth={1.75} />
                    Claim
                  </button>
                )}
                <select
                  aria-label="Assign to"
                  value={item.assigned_to ?? ""}
                  disabled={pending}
                  onChange={(e) => claim(item.id, e.target.value || null)}
                  className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-foreground"
                >
                  <option value="">Unassigned</option>
                  {reviewers.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <Link
                  href={`/review/${item.id}`}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-on-primary transition-colors hover:bg-primary-hover"
                >
                  Review
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
