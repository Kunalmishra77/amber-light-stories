"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import {
  AlertTriangle,
  Ban,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Lock,
  ListChecks,
  Pencil,
  Plus,
  RefreshCcw,
  Trash2,
  Unlock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/status-badge";
import { CONTENT_PILLARS } from "@/lib/planner/mock-plan";
import {
  addCustomTopic,
  approveAllPlanned,
  approveItem,
  disableItem,
  duplicateItem,
  deleteItem,
  editItem,
  moveItemPosition,
  regenerateItem,
  setItemLocked,
  type ActionResult,
} from "./actions";

export interface PlanItem {
  id: string;
  plan_id: string;
  scheduled_date: string;
  topic: string | null;
  angle: string | null;
  pillar: string | null;
  status: string;
  position: number | null;
  locked: boolean | null;
  story_id: string | null;
}

interface PlannerBoardProps {
  planId: string;
  items: PlanItem[];
}

const PILLAR_COLORS: Record<string, string> = {
  "Moral Fable": "#f59e0b",
  "Character Spotlight": "#3b82f6",
  "Wisdom Short": "#22c55e",
  "Cultural Tale": "#a855f7",
  "Life Lesson": "#ec4899",
};

function pillarColor(pillar: string | null): string {
  return PILLAR_COLORS[pillar ?? ""] ?? "var(--muted-foreground)";
}

function formatDate(value: string) {
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function weekStartKey(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  return d.toISOString().slice(0, 10);
}

function weekLabel(weekStart: string) {
  const start = new Date(`${weekStart}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `Week of ${fmt(start)} – ${fmt(end)}`;
}

const ICON_BTN =
  "inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-surface text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40";

function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function toCsv(items: PlanItem[]): string {
  const header = ["date", "topic", "angle", "pillar", "status", "locked"];
  const rows = items.map((i) =>
    [i.scheduled_date, i.topic ?? "", i.angle ?? "", i.pillar ?? "", i.status, i.locked ? "yes" : "no"]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );
  return [header.join(","), ...rows].join("\n");
}

export function PlannerBoard({ planId, items }: PlannerBoardProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTopic, setEditTopic] = useState("");
  const [editAngle, setEditAngle] = useState("");
  const [editPillar, setEditPillar] = useState<string>(CONTENT_PILLARS[0]);
  const [editDate, setEditDate] = useState("");
  const [addFormWeek, setAddFormWeek] = useState<string | null>(null);
  const [addDate, setAddDate] = useState("");
  const [addTopic, setAddTopic] = useState("");
  const [addAngle, setAddAngle] = useState("");
  const [addPillar, setAddPillar] = useState<string>(CONTENT_PILLARS[0]);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const weeks = useMemo(() => {
    const sorted = [...items].sort((a, b) => {
      if (a.scheduled_date !== b.scheduled_date)
        return a.scheduled_date.localeCompare(b.scheduled_date);
      return (a.position ?? 0) - (b.position ?? 0);
    });
    const map = new Map<string, PlanItem[]>();
    for (const item of sorted) {
      const key = weekStartKey(item.scheduled_date);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  const plannedCount = items.filter((i) => i.status === "planned").length;
  const approvedCount = items.filter((i) => i.status === "approved").length;
  const lockedCount = items.filter((i) => i.locked).length;

  function run(id: string, fn: () => Promise<ActionResult>) {
    setFeedback(null);
    setPendingId(id);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setFeedback(result.error ?? "Something went wrong.");
      setPendingId(null);
    });
  }

  function startEdit(item: PlanItem) {
    setEditingId(item.id);
    setEditTopic(item.topic ?? "");
    setEditAngle(item.angle ?? "");
    setEditPillar(item.pillar ?? CONTENT_PILLARS[0]);
    setEditDate(item.scheduled_date);
  }

  function saveEdit(itemId: string) {
    setFeedback(null);
    setPendingId(itemId);
    startTransition(async () => {
      const result = await editItem(itemId, {
        topic: editTopic,
        angle: editAngle,
        pillar: editPillar,
        scheduled_date: editDate,
      });
      if (result.ok) setEditingId(null);
      else setFeedback(result.error ?? "Couldn't save the edit.");
      setPendingId(null);
    });
  }

  function handleAddSubmit(e: FormEvent, weekKey: string) {
    e.preventDefault();
    setFeedback(null);
    startTransition(async () => {
      const result = await addCustomTopic(planId, {
        scheduled_date: addDate || weekKey,
        topic: addTopic,
        angle: addAngle,
        pillar: addPillar,
      });
      if (result.ok) {
        setAddFormWeek(null);
        setAddTopic("");
        setAddAngle("");
        setAddDate("");
      } else {
        setFeedback(result.error ?? "Couldn't add the topic.");
      }
    });
  }

  function handleExport(format: "json" | "csv") {
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === "json") {
      downloadBlob(
        JSON.stringify(items, null, 2),
        `content-plan-${stamp}.json`,
        "application/json"
      );
    } else {
      downloadBlob(toCsv(items), `content-plan-${stamp}.csv`, "text/csv");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Toolbar */}
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-elevated p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
          <span>
            <span className="font-medium tabular-nums text-foreground">{items.length}</span>{" "}
            items
          </span>
          <span>
            <span className="font-medium tabular-nums text-foreground">{plannedCount}</span>{" "}
            planned
          </span>
          <span>
            <span className="font-medium tabular-nums text-foreground">{approvedCount}</span>{" "}
            approved
          </span>
          <span>
            <span className="font-medium tabular-nums text-foreground">{lockedCount}</span>{" "}
            locked
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={isPending || plannedCount === 0}
            onClick={() => run("bulk-approve", () => approveAllPlanned(planId))}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ListChecks className="h-3.5 w-3.5" strokeWidth={2} />
            Approve all planned
          </button>
          <button
            type="button"
            onClick={() => handleExport("json")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-elevated"
          >
            <Download className="h-3.5 w-3.5" strokeWidth={2} />
            Export JSON
          </button>
          <button
            type="button"
            onClick={() => handleExport("csv")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-elevated"
          >
            <Download className="h-3.5 w-3.5" strokeWidth={2} />
            Export CSV
          </button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        This is an editable draft mock plan ($0). AI-researched planning runs
        as a paid step, enabled later.
      </p>

      {feedback ? (
        <div className="flex items-start gap-2 rounded-lg border border-[var(--status-failed)]/30 bg-[var(--status-failed)]/10 px-3 py-2.5 text-xs text-[var(--status-failed)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          <span>{feedback}</span>
        </div>
      ) : null}

      {/* Weeks */}
      <div className="flex flex-col gap-5">
        {weeks.map(([weekKey, weekItems]) => (
          <div key={weekKey} className="rounded-xl border border-border bg-elevated shadow-sm">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h2 className="text-sm font-semibold text-foreground">{weekLabel(weekKey)}</h2>
              <button
                type="button"
                onClick={() => {
                  setAddFormWeek(addFormWeek === weekKey ? null : weekKey);
                  setAddDate(weekKey);
                }}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-hover"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                Add custom topic
              </button>
            </div>

            {addFormWeek === weekKey ? (
              <form
                onSubmit={(e) => handleAddSubmit(e, weekKey)}
                className="flex flex-col gap-2 border-b border-border bg-surface/60 px-5 py-3 sm:flex-row sm:items-end sm:gap-3"
              >
                <div className="flex flex-1 flex-col gap-1">
                  <label className="text-[11px] text-muted-foreground">Date</label>
                  <input
                    type="date"
                    required
                    value={addDate}
                    onChange={(e) => setAddDate(e.target.value)}
                    className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground outline-none focus-visible:border-primary"
                  />
                </div>
                <div className="flex flex-[2] flex-col gap-1">
                  <label className="text-[11px] text-muted-foreground">Topic</label>
                  <input
                    type="text"
                    required
                    value={addTopic}
                    onChange={(e) => setAddTopic(e.target.value)}
                    placeholder="e.g. The Loyal Elephant's Promise"
                    className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground outline-none focus-visible:border-primary"
                  />
                </div>
                <div className="flex flex-1 flex-col gap-1">
                  <label className="text-[11px] text-muted-foreground">Angle</label>
                  <input
                    type="text"
                    value={addAngle}
                    onChange={(e) => setAddAngle(e.target.value)}
                    placeholder="Optional"
                    className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground outline-none focus-visible:border-primary"
                  />
                </div>
                <div className="flex flex-1 flex-col gap-1">
                  <label className="text-[11px] text-muted-foreground">Pillar</label>
                  <select
                    value={addPillar}
                    onChange={(e) => setAddPillar(e.target.value)}
                    className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground outline-none focus-visible:border-primary"
                  >
                    {CONTENT_PILLARS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={isPending}
                    className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddFormWeek(null)}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : null}

            <div className="flex flex-col divide-y divide-border">
              {weekItems.map((item) => {
                const isRowPending = pendingId === item.id && isPending;
                const isEditing = editingId === item.id;

                return (
                  <div key={item.id} className="flex flex-col gap-3 px-5 py-4">
                    {isEditing ? (
                      <div className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <input
                            type="date"
                            value={editDate}
                            onChange={(e) => setEditDate(e.target.value)}
                            className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground outline-none focus-visible:border-primary"
                          />
                          <select
                            value={editPillar}
                            onChange={(e) => setEditPillar(e.target.value)}
                            className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground outline-none focus-visible:border-primary"
                          >
                            {CONTENT_PILLARS.map((p) => (
                              <option key={p} value={p}>
                                {p}
                              </option>
                            ))}
                          </select>
                        </div>
                        <input
                          type="text"
                          value={editTopic}
                          onChange={(e) => setEditTopic(e.target.value)}
                          placeholder="Topic"
                          className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground outline-none focus-visible:border-primary"
                        />
                        <input
                          type="text"
                          value={editAngle}
                          onChange={(e) => setEditAngle(e.target.value)}
                          placeholder="Angle"
                          className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground outline-none focus-visible:border-primary"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={isRowPending}
                            onClick={() => saveEdit(item.id)}
                            className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
                          >
                            <Check className="h-3.5 w-3.5" strokeWidth={2} />
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex flex-1 flex-col gap-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-medium tabular-nums text-muted-foreground">
                              {formatDate(item.scheduled_date)}
                            </span>
                            <span
                              className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium"
                              style={{
                                color: pillarColor(item.pillar),
                                borderColor: `color-mix(in srgb, ${pillarColor(item.pillar)} 35%, transparent)`,
                                backgroundColor: `color-mix(in srgb, ${pillarColor(item.pillar)} 12%, transparent)`,
                              }}
                            >
                              {item.pillar ?? "Uncategorized"}
                            </span>
                            <StatusBadge status={item.status} />
                            {item.locked ? (
                              <Lock
                                className="h-3 w-3 text-muted-foreground"
                                strokeWidth={2}
                                aria-label="Locked"
                              />
                            ) : null}
                          </div>
                          <p lang="en" className="text-sm font-medium text-foreground">
                            {item.topic || "Untitled topic"}
                          </p>
                          {item.angle ? (
                            <p className="text-xs text-muted-foreground">{item.angle}</p>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            title="Move earlier"
                            aria-label="Move earlier"
                            disabled={isRowPending}
                            onClick={() => run(item.id, () => moveItemPosition(item.id, "up"))}
                            className={ICON_BTN}
                          >
                            <ChevronUp className="h-3.5 w-3.5" strokeWidth={2} />
                          </button>
                          <button
                            type="button"
                            title="Move later"
                            aria-label="Move later"
                            disabled={isRowPending}
                            onClick={() => run(item.id, () => moveItemPosition(item.id, "down"))}
                            className={ICON_BTN}
                          >
                            <ChevronDown className="h-3.5 w-3.5" strokeWidth={2} />
                          </button>
                          <button
                            type="button"
                            title="Approve"
                            aria-label="Approve"
                            disabled={isRowPending || Boolean(item.locked) || item.status === "approved"}
                            onClick={() => run(item.id, () => approveItem(item.id))}
                            className={ICON_BTN}
                          >
                            <Check className="h-3.5 w-3.5" strokeWidth={2} />
                          </button>
                          <button
                            type="button"
                            title="Disable"
                            aria-label="Disable"
                            disabled={isRowPending || Boolean(item.locked) || item.status === "disabled"}
                            onClick={() => run(item.id, () => disableItem(item.id))}
                            className={ICON_BTN}
                          >
                            <Ban className="h-3.5 w-3.5" strokeWidth={2} />
                          </button>
                          <button
                            type="button"
                            title={item.locked ? "Unlock" : "Lock"}
                            aria-label={item.locked ? "Unlock" : "Lock"}
                            disabled={isRowPending}
                            onClick={() =>
                              run(item.id, () => setItemLocked(item.id, !item.locked))
                            }
                            className={ICON_BTN}
                          >
                            {item.locked ? (
                              <Unlock className="h-3.5 w-3.5" strokeWidth={2} />
                            ) : (
                              <Lock className="h-3.5 w-3.5" strokeWidth={2} />
                            )}
                          </button>
                          <button
                            type="button"
                            title="Edit"
                            aria-label="Edit"
                            disabled={Boolean(item.locked)}
                            onClick={() => startEdit(item)}
                            className={ICON_BTN}
                          >
                            <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                          </button>
                          <button
                            type="button"
                            title="Regenerate (mock, $0)"
                            aria-label="Regenerate"
                            disabled={isRowPending || Boolean(item.locked)}
                            onClick={() => run(item.id, () => regenerateItem(item.id))}
                            className={ICON_BTN}
                          >
                            <RefreshCcw className="h-3.5 w-3.5" strokeWidth={2} />
                          </button>
                          <button
                            type="button"
                            title="Duplicate"
                            aria-label="Duplicate"
                            disabled={isRowPending}
                            onClick={() => run(item.id, () => duplicateItem(item.id))}
                            className={ICON_BTN}
                          >
                            <Copy className="h-3.5 w-3.5" strokeWidth={2} />
                          </button>
                          <button
                            type="button"
                            title="Delete"
                            aria-label="Delete"
                            disabled={isRowPending || Boolean(item.locked)}
                            onClick={() => {
                              if (
                                typeof window !== "undefined" &&
                                !window.confirm("Delete this plan item?")
                              ) {
                                return;
                              }
                              run(item.id, () => deleteItem(item.id));
                            }}
                            className={cn(ICON_BTN, "hover:border-[var(--status-failed)]/40 hover:text-[var(--status-failed)]")}
                          >
                            <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
