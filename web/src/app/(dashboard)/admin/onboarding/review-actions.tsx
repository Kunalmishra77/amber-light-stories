"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Copy, MessageSquareWarning, ShieldCheck, XCircle } from "lucide-react";
import { approveOnboardingAction, rejectOnboardingAction, requestChangesOnboardingAction } from "./actions";

const BUTTON_CLASS =
  "inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-50";

interface ReviewActionsProps {
  onboardingId: string;
  ownerEmail: string | null;
}

type NotesMode = "reject" | "changes" | null;

export function ReviewActions({ onboardingId, ownerEmail }: ReviewActionsProps) {
  const [isPending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [notesMode, setNotesMode] = useState<NotesMode>(null);
  const [notes, setNotes] = useState("");
  const [copied, setCopied] = useState(false);

  function approve() {
    setError(null);
    setPendingAction("approve");
    startTransition(async () => {
      const result = await approveOnboardingAction(onboardingId);
      if (!result.ok) {
        setError(result.error ?? "Couldn't approve.");
      } else {
        setTempPassword(result.tempPassword ?? null);
      }
      setPendingAction(null);
    });
  }

  function submitNotes() {
    if (!notesMode) return;
    setError(null);
    setPendingAction(notesMode);
    startTransition(async () => {
      const fn = notesMode === "reject" ? rejectOnboardingAction : requestChangesOnboardingAction;
      const result = await fn(onboardingId, notes);
      if (!result.ok) {
        setError(result.error ?? "Action failed.");
      } else {
        setNotesMode(null);
        setNotes("");
      }
      setPendingAction(null);
    });
  }

  async function copyPassword() {
    if (!tempPassword) return;
    try {
      await navigator.clipboard.writeText(tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API unavailable — the password remains visible to copy manually.
    }
  }

  if (tempPassword) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-[var(--status-approved)]/30 bg-[var(--status-approved)]/10 p-3 text-xs">
        <div className="flex items-center gap-1.5 font-medium text-[var(--status-approved)]">
          <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2} />
          Approved — owner account created for {ownerEmail}
        </div>
        <p className="text-muted-foreground">
          Temporary password (shown once — copy and send it to the client now):
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded-md border border-border bg-surface px-2 py-1 font-mono text-foreground">
            {tempPassword}
          </code>
          <button
            type="button"
            onClick={copyPassword}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 font-medium text-foreground transition-colors hover:bg-elevated"
          >
            <Copy className="h-3 w-3" strokeWidth={2} />
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={approve}
          className={BUTTON_CLASS}
        >
          <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />
          {isPending && pendingAction === "approve" ? "Approving…" : "Approve"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => setNotesMode(notesMode === "changes" ? null : "changes")}
          className={BUTTON_CLASS}
        >
          <MessageSquareWarning className="h-3.5 w-3.5" strokeWidth={2} />
          Request changes
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => setNotesMode(notesMode === "reject" ? null : "reject")}
          className={`${BUTTON_CLASS} text-[var(--status-failed)] hover:border-[var(--status-failed)]/40`}
        >
          <XCircle className="h-3.5 w-3.5" strokeWidth={2} />
          Reject
        </button>
      </div>

      {notesMode ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder={notesMode === "reject" ? "Reason for rejection…" : "What needs to change…"}
            rows={2}
            className="w-full rounded-md border border-border bg-elevated px-2 py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={isPending || !notes.trim()}
              onClick={submitNotes}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending
                ? "Submitting…"
                : notesMode === "reject"
                  ? "Confirm reject"
                  : "Send back for changes"}
            </button>
            <button
              type="button"
              onClick={() => {
                setNotesMode(null);
                setNotes("");
              }}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="flex items-start gap-1.5 text-xs text-[var(--status-failed)]">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2} />
          <span>{error}</span>
        </div>
      ) : null}
    </div>
  );
}
