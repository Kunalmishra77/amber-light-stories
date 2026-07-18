"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Ban, CheckCircle2, Lock, Play, Trash2, Unlock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  activateTenantAction,
  deleteTenantAction,
  lockTenantAction,
  suspendTenantAction,
  unlockTenantAction,
  type ActionResult,
} from "./actions";

const BUTTON_CLASS =
  "inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-50";

interface TenantStatusActionsProps {
  tenantId: string;
  status: string;
  compact?: boolean;
}

export function TenantStatusActions({ tenantId, status, compact }: TenantStatusActionsProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  function run(action: string, fn: () => Promise<ActionResult>) {
    setError(null);
    setPendingAction(action);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.error ?? "Action failed.");
      }
      setPendingAction(null);
    });
  }

  const size = compact ? "h-3 w-3" : "h-3.5 w-3.5";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {status !== "active" && status !== "deleted" ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => run("activate", () => activateTenantAction(tenantId))}
            className={BUTTON_CLASS}
          >
            <Play className={size} strokeWidth={2} />
            {isPending && pendingAction === "activate" ? "Activating…" : "Activate"}
          </button>
        ) : null}

        {status === "active" ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => run("suspend", () => suspendTenantAction(tenantId))}
            className={cn(BUTTON_CLASS, "hover:border-[var(--status-paused)]/40")}
          >
            <Ban className={size} strokeWidth={2} />
            {isPending && pendingAction === "suspend" ? "Suspending…" : "Suspend"}
          </button>
        ) : null}

        {status !== "locked" && status !== "deleted" ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => run("lock", () => lockTenantAction(tenantId))}
            className={BUTTON_CLASS}
          >
            <Lock className={size} strokeWidth={2} />
            {isPending && pendingAction === "lock" ? "Locking…" : "Lock"}
          </button>
        ) : null}

        {status === "locked" ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => run("unlock", () => unlockTenantAction(tenantId))}
            className={BUTTON_CLASS}
          >
            <Unlock className={size} strokeWidth={2} />
            {isPending && pendingAction === "unlock" ? "Unlocking…" : "Unlock"}
          </button>
        ) : null}

        {status !== "deleted" ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              if (
                typeof window !== "undefined" &&
                !window.confirm("Soft-delete this client? This can be reversed by reactivating.")
              ) {
                return;
              }
              run("delete", () => deleteTenantAction(tenantId));
            }}
            className={cn(
              BUTTON_CLASS,
              "text-[var(--status-failed)] hover:border-[var(--status-failed)]/40"
            )}
          >
            <Trash2 className={size} strokeWidth={2} />
            {isPending && pendingAction === "delete" ? "Deleting…" : "Delete"}
          </button>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckCircle2 className={size} strokeWidth={2} />
            Deleted
          </span>
        )}
      </div>

      {error ? (
        <div className="flex items-start gap-1.5 text-xs text-[var(--status-failed)]">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2} />
          <span>{error}</span>
        </div>
      ) : null}
    </div>
  );
}
