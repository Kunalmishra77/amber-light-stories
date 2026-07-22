"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { OctagonX, ShieldCheck } from "lucide-react";
import { setPlatformStopAction } from "./actions";
import { cn } from "@/lib/utils";

/**
 * The blast radius here is every tenant, so the control asks for a reason
 * before stopping and states plainly what it does — no confirm-dialog theatre,
 * but no one-click global halt either.
 */
export function PlatformStopControl({ stopped }: { stopped: boolean }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(next: boolean) {
    startTransition(async () => {
      const r = await setPlatformStopAction(next, reason);
      setMessage(r.ok ? (next ? "Platform stopped." : "Stop lifted.") : r.error ?? "That didn't work.");
      if (r.ok) setReason("");
      router.refresh();
    });
  }

  return (
    <section
      className={cn(
        "mt-6 rounded-xl border p-5",
        stopped ? "border-[var(--status-failed)]/40 bg-[var(--status-failed)]/5" : "border-border bg-elevated"
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        {stopped ? (
          <OctagonX className="h-4 w-4 text-[var(--status-failed)]" strokeWidth={1.75} />
        ) : (
          <ShieldCheck className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
        )}
        <h2 className="text-sm font-semibold text-foreground">
          {stopped ? "Platform stop is ON" : "Platform-wide stop"}
        </h2>
      </div>

      <p className="mb-3 max-w-2xl text-xs text-muted-foreground">
        Halts automated advancement in <strong>every</strong> workspace at once: no approvals, no
        publishing, no regeneration, until it is lifted. Content already published is untouched.
        This is separate from maintenance mode, which only affects access to the app.
      </p>

      {!stopped && (
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why are you stopping the platform? (recorded permanently)"
          className="mb-3 w-full max-w-2xl rounded-lg border border-border bg-surface px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      )}

      <button
        type="button"
        disabled={pending || (!stopped && !reason.trim())}
        onClick={() => submit(!stopped)}
        className={cn(
          "rounded-lg px-4 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          stopped
            ? "bg-primary text-on-primary hover:bg-primary-hover"
            : "border border-[var(--status-failed)]/40 text-[var(--status-failed)] hover:bg-[var(--status-failed)]/10"
        )}
      >
        {stopped ? "Lift the platform stop" : "Stop the platform"}
      </button>

      {message && <p className="mt-2 text-[11px] text-muted-foreground">{message}</p>}
    </section>
  );
}
