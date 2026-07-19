"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, ShieldAlert, Trash2 } from "lucide-react";
import { requestAccountDeletionAction } from "./actions";

interface DeletionRequestSectionProps {
  canRequest: boolean;
}

/**
 * "Request account deletion" — confirm dialog + server action. NEVER
 * hard-deletes: the action just flags the tenant for a super admin to
 * review (see requestAccountDeletionAction in ./actions.ts). Only owners
 * or managers can trigger it, since it affects the whole workspace.
 */
export function DeletionRequestSection({ canRequest }: DeletionRequestSectionProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    const id = window.setTimeout(() => cancelRef.current?.focus(), 0);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key === "Tab") {
        // Only Cancel + Confirm are focusable inside the dialog — trap Tab
        // between the two.
        const active = document.activeElement;
        if (event.shiftKey && active === cancelRef.current) {
          event.preventDefault();
          confirmRef.current?.focus();
        } else if (!event.shiftKey && active === confirmRef.current) {
          event.preventDefault();
          cancelRef.current?.focus();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
      window.clearTimeout(id);
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  function confirmDeletion() {
    setError(null);
    startTransition(async () => {
      const result = await requestAccountDeletionAction();
      if (!result.ok) {
        setError(result.error ?? "Couldn't submit the deletion request.");
        return;
      }
      setSubmitted(true);
      setOpen(false);
    });
  }

  if (!canRequest) {
    return (
      <p className="text-xs text-muted-foreground">
        Only workspace owners or managers can request account deletion.
      </p>
    );
  }

  if (submitted) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-[var(--status-approved)]/30 bg-[var(--status-approved)]/10 px-3 py-2.5 text-xs text-[var(--status-approved)]">
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
        <span>
          Deletion request submitted. A super admin will review it — nothing has been deleted, and your
          workspace keeps working normally in the meantime.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-[var(--status-failed)]/40 bg-[var(--status-failed)]/10 px-4 py-2 text-xs font-medium text-[var(--status-failed)] transition-colors hover:bg-[var(--status-failed)]/15"
      >
        <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
        Request account deletion
      </button>
      {error ? (
        <div className="flex items-start gap-1.5 text-xs text-[var(--status-failed)]">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2} />
          <span>{error}</span>
        </div>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 cursor-default bg-black/60 backdrop-blur-sm"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="deletion-dialog-title"
            aria-describedby="deletion-dialog-description"
            className="relative z-10 w-full max-w-md rounded-xl border border-border bg-elevated p-6 shadow-2xl shadow-black/30"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--status-failed)]/10 text-[var(--status-failed)]">
                <ShieldAlert className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <div>
                <h2 id="deletion-dialog-title" className="text-sm font-semibold text-foreground">
                  Request account deletion?
                </h2>
                <p id="deletion-dialog-description" className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  This does <strong className="text-foreground">not</strong> delete anything right away. It
                  flags your entire workspace for a super admin to review, and is recorded in the audit
                  log. You and your team can keep using everything normally until a super admin actions
                  the request.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                ref={cancelRef}
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex items-center rounded-lg border border-border bg-surface px-4 py-2 text-xs font-medium text-foreground transition-colors hover:bg-elevated"
              >
                Cancel
              </button>
              <button
                ref={confirmRef}
                type="button"
                disabled={isPending}
                onClick={confirmDeletion}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--status-failed)] px-4 py-2 text-xs font-medium text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? "Submitting…" : "Yes, request deletion"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
