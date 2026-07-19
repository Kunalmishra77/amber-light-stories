"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, LogOut } from "lucide-react";
import { signOutEverywhere } from "./actions";

export function SignOutEverywhereButton() {
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await signOutEverywhere();
      if (!result.ok) {
        setError(result.error ?? "Couldn't sign out everywhere.");
        setConfirming(false);
        return;
      }
      router.push("/login");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={isPending}
        onClick={handleClick}
        className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-[var(--status-failed)]/40 bg-[var(--status-failed)]/10 px-4 py-2 text-xs font-medium text-[var(--status-failed)] transition-colors hover:bg-[var(--status-failed)]/15 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <LogOut className="h-3.5 w-3.5" strokeWidth={2} />
        {isPending ? "Signing out…" : confirming ? "Click again to confirm" : "Sign out everywhere"}
      </button>
      {error ? (
        <div className="flex items-start gap-1.5 text-xs text-[var(--status-failed)]">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2} />
          <span>{error}</span>
        </div>
      ) : null}
    </div>
  );
}
