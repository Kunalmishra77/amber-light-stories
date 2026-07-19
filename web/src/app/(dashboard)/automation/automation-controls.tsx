"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Power, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { resumeAutomation, setAutomationEnabled, triggerEmergencyStop } from "./actions";

export function AutomationSwitch({
  initialEnabled,
  canEdit,
}: {
  initialEnabled: boolean;
  canEdit: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    if (!canEdit || isPending) return;
    setError(null);
    const next = !enabled;
    setEnabled(next);
    startTransition(async () => {
      const result = await setAutomationEnabled(next);
      if (!result.ok) {
        setEnabled(!next);
        setError(result.error ?? "Couldn't update automation.");
      }
    });
  }

  return (
    <div className="rounded-xl border border-border bg-elevated p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", enabled ? "bg-primary/10 text-primary" : "bg-surface text-muted-foreground")}>
            <Power className="h-5 w-5" strokeWidth={1.75} />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Automation</p>
            <p className="text-xs text-muted-foreground">
              {enabled ? "Running — the pipeline advances and publishes on schedule." : "Paused — nothing runs automatically."}
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={!canEdit || isPending}
          onClick={toggle}
          className={cn(
            "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50",
            enabled ? "bg-primary" : "bg-surface border border-border"
          )}
        >
          <span
            className={cn(
              "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
              enabled ? "translate-x-6" : "translate-x-1"
            )}
          />
        </button>
      </div>
      {!canEdit ? (
        <p className="mt-3 text-xs text-muted-foreground">Only owners or managers can change this switch.</p>
      ) : null}
      {error ? (
        <div className="mt-3 flex items-start gap-1.5 text-xs text-[var(--status-failed)]">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2} />
          <span>{error}</span>
        </div>
      ) : null}
    </div>
  );
}

export function EmergencyStopControl({
  initialStopped,
  canEdit,
}: {
  initialStopped: boolean;
  canEdit: boolean;
}) {
  const [stopped, setStopped] = useState(initialStopped);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleStop() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await triggerEmergencyStop();
      if (!result.ok) {
        setError(result.error ?? "Couldn't trigger emergency stop.");
        setConfirming(false);
        return;
      }
      setStopped(true);
      setConfirming(false);
      router.refresh();
    });
  }

  function handleResume() {
    setError(null);
    startTransition(async () => {
      const result = await resumeAutomation();
      if (!result.ok) {
        setError(result.error ?? "Couldn't resume automation.");
        return;
      }
      setStopped(false);
      router.refresh();
    });
  }

  return (
    <div
      className={cn(
        "rounded-xl border p-5 shadow-sm",
        stopped ? "border-[var(--status-failed)]/40 bg-[var(--status-failed)]/10" : "border-border bg-elevated"
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
            stopped ? "bg-[var(--status-failed)]/15 text-[var(--status-failed)]" : "bg-surface text-muted-foreground"
          )}
        >
          <ShieldAlert className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <div className="flex-1">
          <p className={cn("text-sm font-semibold", stopped ? "text-[var(--status-failed)]" : "text-foreground")}>
            Emergency stop
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {stopped
              ? "Publishing is halted for this workspace. Resume when you're ready."
              : "Immediately halts all scheduled publishing for this workspace — a hard override on top of the automation switch."}
          </p>
          {canEdit ? (
            <div className="mt-3">
              {stopped ? (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleResume}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
                >
                  {isPending ? "Resuming…" : "Resume publishing"}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleStop}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--status-failed)]/40 bg-[var(--status-failed)]/10 px-4 py-2 text-xs font-medium text-[var(--status-failed)] transition-colors hover:bg-[var(--status-failed)]/15 disabled:opacity-50"
                >
                  {isPending ? "Stopping…" : confirming ? "Click again to confirm" : "Emergency stop"}
                </button>
              )}
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">Only owners or managers can trigger this.</p>
          )}
          {error ? (
            <div className="mt-2 flex items-start gap-1.5 text-xs text-[var(--status-failed)]">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2} />
              <span>{error}</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
