"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { revokeInvite } from "./actions";

export function RevokeInviteButton({ invitationId }: { invitationId: string }) {
  const [revoked, setRevoked] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (revoked) return null;

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await revokeInvite(invitationId);
          if (result.ok) setRevoked(true);
        })
      }
      className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-[var(--status-failed)]/40 hover:text-[var(--status-failed)] disabled:opacity-50"
    >
      <X className="h-3 w-3" strokeWidth={2} />
      {isPending ? "Revoking…" : "Revoke"}
    </button>
  );
}
