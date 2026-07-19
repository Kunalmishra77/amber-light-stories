"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, Check, ExternalLink, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/status-badge";
import { approveItem, disableItem } from "../planner/actions";

export interface CalendarPlanItem {
  id: string;
  scheduled_date: string;
  topic: string | null;
  pillar: string | null;
  status: string;
}

interface CalendarGridProps {
  /** First day of the displayed month, as YYYY-MM-01. */
  monthStart: string;
  itemsByDate: Record<string, CalendarPlanItem[]>;
  todayStr: string;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const PILLAR_DOT: Record<string, string> = {
  "Moral Fable": "var(--status-approved)",
  "Character Spotlight": "var(--status-awaiting-review)",
  "Wisdom Short": "var(--primary)",
  "Cultural Tale": "var(--status-paused)",
  "Life Lesson": "var(--status-running)",
};

function buildMonthCells(monthStart: string): { date: string; inMonth: boolean }[] {
  const [y, m] = monthStart.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const startWeekday = first.getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();

  const cells: { date: string; inMonth: boolean }[] = [];

  for (let i = 0; i < startWeekday; i++) {
    const d = new Date(Date.UTC(y, m - 1, 1 - (startWeekday - i)));
    cells.push({ date: d.toISOString().slice(0, 10), inMonth: false });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ date: `${monthStart.slice(0, 8)}${String(day).padStart(2, "0")}`, inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const last = new Date(`${cells[cells.length - 1].date}T00:00:00Z`);
    last.setUTCDate(last.getUTCDate() + 1);
    cells.push({ date: last.toISOString().slice(0, 10), inMonth: false });
  }

  return cells;
}

export function CalendarGrid({ monthStart, itemsByDate, todayStr }: CalendarGridProps) {
  const cells = useMemo(() => buildMonthCells(monthStart), [monthStart]);
  const [selectedDate, setSelectedDate] = useState<string | null>(todayStr);

  const selectedItems = selectedDate ? (itemsByDate[selectedDate] ?? []) : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-hidden rounded-xl border border-border bg-elevated shadow-sm">
        <div className="grid grid-cols-7 border-b border-border bg-surface/60">
          {WEEKDAYS.map((w) => (
            <div key={w} className="px-2 py-2.5 text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((cell) => {
            const items = itemsByDate[cell.date] ?? [];
            const isToday = cell.date === todayStr;
            const isSelected = cell.date === selectedDate;
            const dayNum = Number(cell.date.slice(8, 10));

            return (
              <button
                key={cell.date}
                type="button"
                onClick={() => setSelectedDate(cell.date)}
                className={cn(
                  "flex min-h-[86px] flex-col items-start gap-1 border-b border-r border-border p-2 text-left transition-colors last:border-r-0",
                  !cell.inMonth && "bg-surface/40 text-muted-foreground/50",
                  isSelected && "bg-primary/10",
                  !isSelected && cell.inMonth && "hover:bg-surface/60"
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium tabular-nums",
                    isToday ? "bg-primary text-on-primary" : "text-foreground",
                    !cell.inMonth && "text-muted-foreground/50"
                  )}
                >
                  {dayNum}
                </span>
                <div className="flex flex-col gap-1">
                  {items.slice(0, 3).map((item) => (
                    <span key={item.id} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: PILLAR_DOT[item.pillar ?? ""] ?? "var(--status-pending)" }}
                        aria-hidden="true"
                      />
                      <span className="truncate">{item.topic || "Untitled"}</span>
                    </span>
                  ))}
                  {items.length > 3 ? (
                    <span className="text-[10px] text-muted-foreground">+{items.length - 3} more</span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-elevated shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">
            {selectedDate
              ? new Date(`${selectedDate}T00:00:00Z`).toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })
              : "Select a day"}
          </h2>
          <Link href="/planner" className="text-xs text-muted-foreground hover:text-foreground">
            Open full planner
          </Link>
        </div>
        {selectedItems.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">Nothing scheduled this day.</p>
        ) : (
          <ul className="divide-y divide-border">
            {selectedItems.map((item) => (
              <DayItemRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function DayItemRow({ item }: { item: CalendarPlanItem }) {
  const [status, setStatus] = useState(item.status);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; error?: string }>, next: string) {
    setError(null);
    const prev = status;
    setStatus(next);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setStatus(prev);
        setError(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <li className="flex flex-col gap-1.5 px-5 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p lang="en" className="truncate text-sm font-medium text-foreground">
            {item.topic || "Untitled topic"}
          </p>
          <p className="text-xs text-muted-foreground">{item.pillar ?? "Uncategorized"}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusBadge status={status} />
          {status === "planned" ? (
            <>
              <button
                type="button"
                disabled={isPending}
                onClick={() => run(() => approveItem(item.id), "approved")}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground transition-colors hover:text-[var(--status-approved)] disabled:opacity-50"
                title="Approve"
                aria-label="Approve"
              >
                <Check className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => run(() => disableItem(item.id), "disabled")}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground transition-colors hover:text-[var(--status-failed)] disabled:opacity-50"
                title="Disable"
                aria-label="Disable"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            </>
          ) : null}
          <Link
            href="/planner"
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground transition-colors hover:text-foreground"
            title="Edit in planner"
            aria-label="Edit in planner"
          >
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} />
          </Link>
        </div>
      </div>
      {error ? (
        <div className="flex items-start gap-1.5 text-xs text-[var(--status-failed)]">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2} />
          <span>{error}</span>
        </div>
      ) : null}
    </li>
  );
}
