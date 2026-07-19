"use client";

import { useState, useTransition } from "react";
import { CheckCheck, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ClientTime } from "@/components/client-time";
import { markAllNotificationsRead, markNotificationRead } from "./actions";

export interface NotificationRow {
  id: string;
  kind: string | null;
  title: string | null;
  body: string | null;
  read: boolean | null;
  created_at: string | null;
}

export function NotificationsList({ notifications }: { notifications: NotificationRow[] }) {
  const [items, setItems] = useState(notifications);
  const [, startTransition] = useTransition();
  const unreadCount = items.filter((n) => !n.read).length;

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
    <div className="rounded-xl border border-border bg-elevated">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">Recent</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs tabular-nums text-muted-foreground">
            {unreadCount} unread
          </span>
          {unreadCount > 0 ? (
            <button
              type="button"
              onClick={handleMarkAll}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-elevated"
            >
              <CheckCheck className="h-3.5 w-3.5" strokeWidth={2} />
              Mark all read
            </button>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col divide-y divide-border">
        {items.map((n) => (
          <div
            key={n.id}
            className={cn(
              "flex items-start gap-3 px-5 py-4 transition-colors",
              !n.read && "bg-primary/5"
            )}
          >
            <span
              className={cn(
                "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                n.read ? "bg-transparent" : "bg-primary"
              )}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <span
                  className={cn(
                    "truncate text-sm",
                    n.read ? "font-medium text-muted-foreground" : "font-semibold text-foreground"
                  )}
                >
                  {n.title ?? "Notification"}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  <ClientTime value={n.created_at} mode="datetime" />
                </span>
              </div>
              {n.body ? (
                <p className="mt-1 text-xs text-muted-foreground">{n.body}</p>
              ) : null}
              <div className="mt-2 flex items-center gap-2">
                {n.kind ? (
                  <span className="inline-flex items-center rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {n.kind}
                  </span>
                ) : null}
                {!n.read ? (
                  <button
                    type="button"
                    onClick={() => handleMarkRead(n.id)}
                    className="inline-flex cursor-pointer items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                  >
                    <Circle className="h-2.5 w-2.5 fill-current" strokeWidth={0} />
                    Mark read
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
