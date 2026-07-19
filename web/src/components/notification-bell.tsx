"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/app/(dashboard)/notifications/actions";

export interface BellNotification {
  id: string;
  kind: string | null;
  title: string | null;
  body: string | null;
  read: boolean | null;
  created_at: string | null;
}

function formatRelative(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}

interface NotificationBellProps {
  notifications: BellNotification[];
}

/**
 * Topbar bell: shows an unread badge and a dropdown of recent notifications
 * with mark-as-read / mark-all-read. Updates local state optimistically so
 * the badge reacts instantly, then fires the server action in the
 * background — worst case a page revalidation corrects any drift.
 */
export function NotificationBell({ notifications }: NotificationBellProps) {
  const [items, setItems] = useState(notifications);
  // Re-sync local state when the server passes a new `notifications` array
  // (e.g. after navigation triggers a fresh layout render). Comparing +
  // setting during render — rather than in an effect — is the pattern React
  // recommends for "adjusting state when a prop changes": it avoids an
  // extra commit/re-render pass.
  const [prevNotifications, setPrevNotifications] = useState(notifications);
  if (notifications !== prevNotifications) {
    setPrevNotifications(notifications);
    setItems(notifications);
  }

  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const unread = items.filter((n) => !n.read).length;

  function handleMarkRead(id: string) {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    startTransition(() => {
      void markNotificationRead(id);
    });
  }

  function handleMarkAll() {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    startTransition(() => {
      void markAllNotificationsRead();
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={unread > 0 ? `Notifications (${unread} unread)` : "Notifications"}
        aria-expanded={open}
        className="relative inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-border bg-elevated text-muted-foreground transition-colors duration-200 ease-out hover:text-foreground"
      >
        <Bell className="h-[18px] w-[18px]" strokeWidth={1.75} />
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-on-primary">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute right-0 z-50 mt-2 w-80 max-w-[90vw] overflow-hidden rounded-xl border border-border bg-elevated shadow-lg">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="text-sm font-semibold text-foreground">Notifications</span>
              {unread > 0 ? (
                <button
                  type="button"
                  onClick={handleMarkAll}
                  className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <CheckCheck className="h-3.5 w-3.5" strokeWidth={2} />
                  Mark all read
                </button>
              ) : null}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-4 py-8 text-center text-xs text-muted-foreground">
                  You&apos;re all caught up.
                </p>
              ) : (
                items.slice(0, 8).map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => handleMarkRead(n.id)}
                    className={cn(
                      "flex w-full cursor-pointer flex-col gap-0.5 border-b border-border px-4 py-3 text-left transition-colors last:border-0 hover:bg-surface",
                      !n.read && "bg-primary/5"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium text-foreground">
                        {n.title ?? "Notification"}
                      </span>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className="text-[10px] tabular-nums text-muted-foreground">
                          {formatRelative(n.created_at)}
                        </span>
                        {!n.read ? (
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                            aria-hidden="true"
                          />
                        ) : null}
                      </div>
                    </div>
                    {n.body ? (
                      <span className="truncate text-xs text-muted-foreground">{n.body}</span>
                    ) : null}
                  </button>
                ))
              )}
            </div>
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="block border-t border-border px-4 py-2.5 text-center text-xs font-medium text-primary hover:underline"
            >
              View all
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}
