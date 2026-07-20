"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Unlock } from "lucide-react";
import { unlockUserAction } from "../actions";

interface MemberUnlockButtonProps {
  tenantId: string;
  userId: string;
}

/** Clears account lockout for a locked member — the super-admin escape
 * hatch for the P6.2 lockout policy (5 failed attempts -> 15 min lock). */
export function MemberUnlockButton({ tenantId, userId }: MemberUnlockButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      await unlockUserAction(tenantId, userId);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={handleClick}
      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Unlock className="h-3 w-3" strokeWidth={2} />
      {isPending ? "Unlocking…" : "Unlock"}
    </button>
  );
}
