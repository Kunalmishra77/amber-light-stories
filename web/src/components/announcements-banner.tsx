"use client";

import { useSyncExternalStore } from "react";
import { Megaphone, X } from "lucide-react";

export interface AnnouncementData {
  id: string;
  title: string;
  body: string;
}

const STORAGE_KEY = "dismissed-announcements";

/** Tiny in-memory pub/sub so `useSyncExternalStore` can re-render this
 * component the moment `dismiss()` writes to localStorage — localStorage
 * itself has no change event within the same tab. */
const listeners = new Set<() => void>();
function notifyListeners() {
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readDismissed(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function dismiss(id: string) {
  const next = Array.from(new Set([...readDismissed(), id]));
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // best-effort — the banner will just reappear next visit
  }
  notifyListeners();
}

/**
 * Dismissible amber-accented banner for the latest active announcement.
 * Dismissal is stored in localStorage keyed by announcement id, so a new
 * announcement always reappears even if a previous one was dismissed.
 *
 * Reads localStorage via useSyncExternalStore (not a useEffect + setState)
 * so the server-rendered snapshot ("not dismissed") and the client's real
 * snapshot reconcile through React's built-in hydration-safe path, with no
 * flash-then-hide flicker and no synchronous setState-in-effect.
 */
export function AnnouncementsBanner({ announcement }: { announcement: AnnouncementData | null }) {
  const dismissed = useSyncExternalStore(
    subscribe,
    () => (announcement ? readDismissed().includes(announcement.id) : true),
    () => true // server snapshot: render nothing until hydrated, avoids a flash
  );

  if (!announcement || dismissed) return null;

  return (
    <div
      role="region"
      aria-label="Announcement"
      className="mb-6 flex items-start gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 shadow-sm"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Megaphone className="h-4 w-4" strokeWidth={1.75} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{announcement.title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{announcement.body}</p>
      </div>
      <button
        type="button"
        onClick={() => dismiss(announcement.id)}
        aria-label="Dismiss announcement"
        className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 ease-out hover:bg-elevated hover:text-foreground"
      >
        <X className="h-4 w-4" strokeWidth={1.75} />
      </button>
    </div>
  );
}
