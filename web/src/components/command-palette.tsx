"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Command,
  Search,
  Wand2,
  ClipboardCheck,
  PenLine,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { navGroups, adminNavGroup } from "@/lib/nav";
import { cn } from "@/lib/utils";

interface PaletteItem {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  group: string;
}

const QUICK_ACTIONS: PaletteItem[] = [
  { id: "quick-generate", label: "Generate video", href: "/generate", icon: Wand2, group: "Quick actions" },
  {
    id: "quick-approvals",
    label: "Review approvals",
    href: "/approvals",
    icon: ClipboardCheck,
    group: "Quick actions",
  },
  { id: "quick-manual", label: "New content", href: "/manual", icon: PenLine, group: "Quick actions" },
  { id: "quick-settings", label: "Settings", href: "/settings", icon: Settings, group: "Quick actions" },
];

interface CommandPaletteProps {
  isSuperAdmin?: boolean;
}

/**
 * Global ⌘K / Ctrl+K command palette — searches every nav destination (from
 * src/lib/nav.ts, respecting groups + super-admin visibility) plus a small
 * set of quick actions. Self-contained: owns its own open state and renders
 * both the topbar trigger button and the dialog, so it can be dropped
 * straight into the layout/topbar with no wiring from the caller besides
 * `isSuperAdmin`.
 */
export function CommandPalette({ isSuperAdmin = false }: CommandPaletteProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const previouslyFocused = React.useRef<HTMLElement | null>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  const items = React.useMemo<PaletteItem[]>(() => {
    const groups = isSuperAdmin ? [...navGroups, adminNavGroup] : navGroups;
    const navItems: PaletteItem[] = groups.flatMap((g) =>
      g.items.map((item) => ({
        id: `nav-${item.href}`,
        label: item.label,
        href: item.href,
        icon: item.icon,
        group: g.label,
      }))
    );
    return [...QUICK_ACTIONS, ...navItems];
  }, [isSuperAdmin]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) => item.label.toLowerCase().includes(q) || item.href.toLowerCase().includes(q)
    );
  }, [items, query]);

  // Flattened render rows — a header row per group (in order of first
  // appearance) followed by its item rows, each carrying its index into
  // `filtered` (used for keyboard active-state + navigation). Kept as a
  // single flat list (rather than a nested group->items structure rendered
  // via nested .map() calls) so the list below is one single .map() — two
  // levels of nested list-rendering closures around a ref-touching
  // navigate() callback trips react-hooks/refs' escape analysis.
  type PaletteRow =
    | { kind: "header"; key: string; group: string }
    | { kind: "item"; key: string; item: PaletteItem; index: number };

  const rows = React.useMemo<PaletteRow[]>(() => {
    const seenGroups = new Set<string>();
    const result: PaletteRow[] = [];
    filtered.forEach((item, index) => {
      if (!seenGroups.has(item.group)) {
        seenGroups.add(item.group);
        result.push({ kind: "header", key: `header-${item.group}`, group: item.group });
      }
      result.push({ kind: "item", key: item.id, item, index });
    });
    return result;
  }, [filtered]);

  const openPalette = React.useCallback(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    setQuery("");
    setActiveIndex(0);
    setOpen(true);
  }, []);

  const closePalette = React.useCallback(() => {
    setOpen(false);
    previouslyFocused.current?.focus?.();
  }, []);

  // Global ⌘K / Ctrl+K listener — toggles the palette from anywhere. Reads
  // `open` from the closure (and re-subscribes when it changes) rather than
  // a functional setState updater, since updater callbacks must stay pure —
  // no ref reads/writes inside them.
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (open) {
          closePalette();
        } else {
          openPalette();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, openPalette, closePalette]);

  // Lock body scroll + focus the search input whenever the dialog opens.
  React.useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      document.body.style.overflow = "";
      window.clearTimeout(id);
    };
  }, [open]);

  // Keep the active row visible while navigating with the keyboard.
  React.useEffect(() => {
    if (!open) return;
    const activeEl = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    activeEl?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  // Navigating away means the previously-focused element (the trigger
  // button) is about to unmount/rerender anyway — skip refocusing it.
  const closePaletteWithoutRefocus = React.useCallback(() => {
    setOpen(false);
    previouslyFocused.current = null;
  }, []);

  const navigate = React.useCallback(
    (item: PaletteItem) => {
      closePaletteWithoutRefocus();
      router.push(item.href);
    },
    [closePaletteWithoutRefocus, router]
  );

  function onKeyDownDialog(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      closePalette();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const item = filtered[activeIndex];
      if (item) navigate(item);
      return;
    }
    // Trap focus: the search input is the only focusable element inside the
    // dialog, so Tab should never leave it.
    if (event.key === "Tab") {
      event.preventDefault();
    }
  }

  const activeItem = filtered[activeIndex];
  const activeId = activeItem ? `command-palette-item-${activeItem.id}` : undefined;

  return (
    <>
      <button
        type="button"
        onClick={openPalette}
        aria-label="Open command palette"
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-elevated px-3 text-xs font-medium text-muted-foreground transition-colors duration-200 ease-out hover:border-primary/40 hover:text-foreground"
      >
        <Search className="h-3.5 w-3.5" strokeWidth={1.75} />
        <span className="hidden sm:inline">Search</span>
        <kbd className="hidden items-center gap-0.5 rounded border border-border bg-surface px-1.5 py-0.5 font-sans text-[10px] font-medium text-muted-foreground sm:inline-flex">
          <Command className="h-2.5 w-2.5" strokeWidth={2} />K
        </kbd>
      </button>

      {open ? (
        <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[12vh]">
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={closePalette}
            className="fixed inset-0 cursor-default bg-black/60 backdrop-blur-sm"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            onKeyDown={onKeyDownDialog}
            className="relative z-10 flex w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-elevated shadow-2xl shadow-black/30"
          >
            <div className="flex items-center gap-2.5 border-b border-border px-4">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
              <input
                ref={inputRef}
                type="text"
                role="combobox"
                aria-expanded="true"
                aria-controls="command-palette-list"
                aria-activedescendant={activeId}
                autoComplete="off"
                spellCheck={false}
                placeholder="Search pages, generate a video, review approvals…"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
                className="h-12 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
              <span className="hidden shrink-0 text-[10px] text-muted-foreground sm:inline">Esc to close</span>
            </div>

            <div
              id="command-palette-list"
              role="listbox"
              aria-label="Search results"
              ref={listRef}
              className="max-h-[60vh] overflow-y-auto p-2"
            >
              {filtered.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No matches for &ldquo;{query}&rdquo;.
                </p>
              ) : (
                rows.map((row) =>
                  row.kind === "header" ? (
                    <p
                      key={row.key}
                      role="presentation"
                      className="mt-3 px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground first:mt-0"
                    >
                      {row.group}
                    </p>
                  ) : (
                    <PaletteResultButton
                      key={row.key}
                      item={row.item}
                      active={row.index === activeIndex}
                      onHover={() => setActiveIndex(row.index)}
                      onSelect={navigate}
                    />
                  )
                )
              )}
            </div>

            <div className="flex items-center gap-3 border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-sans">↑↓</kbd>
                Navigate
              </span>
              <span className="inline-flex items-center gap-1">
                <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-sans">Enter</kbd>
                Open
              </span>
              <span className="inline-flex items-center gap-1">
                <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-sans">Esc</kbd>
                Close
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

interface PaletteResultButtonProps {
  item: PaletteItem;
  active: boolean;
  onHover: () => void;
  onSelect: (item: PaletteItem) => void;
}

/** A single result row — its own component (rather than an inline closure
 * inside CommandPalette's list .map()) so its click handler only ever
 * touches the `onSelect` callback prop, never a ref, keeping it trivially
 * safe under React's ref-during-render checks. */
function PaletteResultButton({ item, active, onHover, onSelect }: PaletteResultButtonProps) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      id={`command-palette-item-${item.id}`}
      role="option"
      aria-selected={active}
      data-active={active}
      onMouseEnter={onHover}
      onClick={() => onSelect(item)}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors duration-100 ease-out",
        active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-surface"
      )}
    >
      <Icon
        className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-muted-foreground")}
        strokeWidth={1.75}
      />
      <span className="truncate">{item.label}</span>
      <span className="ml-auto truncate text-[11px] font-normal text-muted-foreground">{item.href}</span>
    </button>
  );
}
